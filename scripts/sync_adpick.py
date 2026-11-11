
"""Sync Adpick shopping API products into Sobi Namu. Stdlib only; no scraping."""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {'Accept': 'application/json', 'User-Agent': 'SobiNamu/1.0'})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise ValueError(f'Unexpected HTTP {response.status}')
        raw = response.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError('API response exceeds 8MB limit')
        return json.loads(raw.decode('utf-8-sig'))


def first(d, *keys):
    for key in keys:
        if key in d and d[key] not in (None, ''):
            return d[key]
    return None


def find_items(obj):
    if isinstance(obj, list):
        if obj and all(isinstance(i, dict) for i in obj):
            return obj
        return []
    if isinstance(obj, dict):
        for k in ('products', 'items', 'productList', 'product_list', 'list', 'results', 'data', 'result'):
            if k in obj:
                found = find_items(obj[k])
                if found:
                    return found
        for value in obj.values():
            if isinstance(value, (list, dict)):
                found = find_items(value)
                if found:
                    return found
    return []


def valid_https(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    parsed = urllib.parse.urlparse(value)
    return value if parsed.scheme == 'https' and parsed.netloc and not parsed.username else None


def amount(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        n = int(value)
    elif isinstance(value, str):
        s = re.sub(r'[\s,원₩]', '', value)
        if not re.fullmatch(r'\d+(?:\.0+)?', s):
            return None
        n = int(float(s))
    else:
        return None
    return n if 0 <= n <= 2_000_000_000 else None


def normalize(item):
    name = first(item, 'productName', 'product_name', 'name', 'title', 'goods_name', 'goodsName', 'productnm')
    price = amount(first(item, 'salePrice', 'sale_price', 'price', 'productPrice', 'product_price', 'selling_price', 'discount_price', 'productprice'))
    url = valid_https(first(item, 'productUrl', 'product_url', 'link', 'url', 'purchase_url', 'click_url', 'deeplink', 'productLink', 'productlink'))
    if not isinstance(name, str) or not name.strip() or price is None or not url:
        return None
    source_id = first(item, 'productId', 'product_id', 'id', 'goods_id', 'goodsId', 'productno', 'product_no')
    if source_id is None:
        source_id = hashlib.sha256((url+'|'+name).encode()).hexdigest()[:32]
    image = valid_https(first(item, 'imageUrl', 'image_url', 'image', 'thumbnail', 'thumbnailUrl', 'thumbnail_url', 'img', 'productImage', 'product_image'))
    shipping = amount(first(item, 'shipping', 'shipping_fee', 'shippingFee', 'delivery_fee', 'deliveryFee'))
    return {
        'source': 'adpick', 'source_product_id': str(source_id)[:200], 'name': name.strip()[:500],
        'brand': str(first(item, 'brand', 'brandName', 'brand_name') or '')[:200] or None,
        'category': str(first(item, 'category', 'categoryName', 'category_name') or '')[:200] or None,
        'price': price, 'currency': 'KRW', 'image_url': image, 'purchase_url': url,
        'shipping': shipping, 'sustainability_status': 'unverified',
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


def main():
    api_url = os.environ.get('ADPICK_API_URL', '').strip()
    parsed = urllib.parse.urlparse(api_url)
    host = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or not (host == 'adpick.co.kr' or host.endswith('.adpick.co.kr')) or parsed.username or parsed.password:
        sys.exit('ADPICK_API_URL must be an HTTPS URL hosted by adpick.co.kr')
    try:
        payload = fetch_json(api_url)
    except (urllib.error.URLError, ValueError, json.JSONDecodeError):
        sys.exit('Adpick request failed; check the saved API URL and access permissions')
    items = find_items(payload)
    if not items:
        keys = list(payload)[:12] if isinstance(payload, dict) else []
        sys.exit(f'No recognizable product list. Top-level response keys: {keys}. No data was written.')
    records = {}
    for item in items:
        row = normalize(item)
        if row:
            records[row['source_product_id']] = row
    print(f'API returned {len(items)} items; validated {len(records)} products')
    

    if not records:
        print('First product field names:', sorted(items[0].keys()))
        nested = items[0].get('list')
        print('Nested list type:', type(nested).__name__)
        if isinstance(nested, list) and nested:
            print('Nested first item type:', type(nested[0]).__name__)
            if isinstance(nested[0], dict):
                print('Nested first item fields:', sorted(nested[0].keys()))
        sys.exit('Product fields do not match expected schema. No data was written.')


    if len(records) < len(items):
        print('Some items skipped because required name, numeric price or HTTPS purchase URL was missing.')
    if os.environ.get('DRY_RUN', 'false').lower() == 'true':
        print('Dry run completed. No data was written.')
        return
    supabase = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not supabase.startswith('https://') or not key:
        sys.exit('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in GitHub Secrets')
    endpoint = supabase + '/rest/v1/sobi_product_catalog?on_conflict=source,source_product_id'
    rows = list(records.values())
    for start in range(0, len(rows), 100):
        req = urllib.request.Request(endpoint, data=json.dumps(rows[start:start+100], ensure_ascii=False).encode(),
            headers={'apikey': key, 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json',
                     'Prefer': 'resolution=merge-duplicates,return=minimal'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f'Supabase returned HTTP {response.status}')
        except urllib.error.HTTPError as exc:
            sys.exit(f'Supabase write failed: HTTP {exc.code}; verify table permissions and schema')
    print(f'Successfully synchronized {len(rows)} real products to sobi_product_catalog')


if __name__ == '__main__':
    main()
