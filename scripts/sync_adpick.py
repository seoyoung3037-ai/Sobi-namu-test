
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def first(data, *keys):
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return None


def find_items(obj):
    """Find actual products inside Adpick's theme lists."""
    if isinstance(obj, list):
        if any(
            isinstance(item, dict) and "product_name" in item
            for item in obj
        ):
            return [
                item for item in obj
                if isinstance(item, dict)
                and "product_name" in item
            ]

        products = []
        for item in obj:
            products.extend(find_items(item))
        return products

    if isinstance(obj, dict):
        products = []
        for key in (
            "list", "products", "items", "productList",
            "product_list", "results", "data", "result"
        ):
            if key in obj:
                products.extend(find_items(obj[key]))

        if products:
            return products

        for value in obj.values():
            if isinstance(value, (dict, list)):
                products.extend(find_items(value))
        return products

    return []


def https_url(value):
    if not isinstance(value, str):
        return None

    value = value.strip()
    parsed = urllib.parse.urlparse(value)

    if (
        parsed.scheme == "https"
        and parsed.hostname
        and not parsed.username
        and not parsed.password
    ):
        return value

    return None


def price_number(value):
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        number = int(value)
    elif isinstance(value, str):
        cleaned = re.sub(r"[\s,원₩]", "", value)
        if not re.fullmatch(r"\d+(?:\.0+)?", cleaned):
            return None
        number = int(float(cleaned))
    else:
        return None

    if 0 <= number <= 2_000_000_000:
        return number

    return None


def normalize(item):
    name = first(
        item, "product_name", "productName",
        "name", "title"
    )

    price = price_number(first(
        item, "price_sale", "salePrice",
        "sale_price", "price"
    ))

    purchase_url = https_url(first(
        item, "buyurl", "productUrl",
        "product_url", "purchase_url", "link", "url"
    ))

    if (
        not isinstance(name, str)
        or not name.strip()
        or price is None
        or not purchase_url
    ):
        return None

    product_id = first(
        item, "product_id", "productId",
        "id", "goods_id"
    )

    if product_id is None:
        product_id = hashlib.sha256(
            purchase_url.encode("utf-8")
        ).hexdigest()[:32]

    image_url = https_url(first(
        item, "photo", "imageUrl",
        "image_url", "image", "thumbnail"
    ))

    mall_name = first(
        item, "mall_name", "brand",
        "brandName", "brand_name"
    )

    return {
        "source": "adpick",
        "source_product_id": str(product_id)[:200],
        "name": name.strip()[:500],
        "brand": str(mall_name)[:200] if mall_name else None,
        "category": None,
        "price": price,
        "currency": "KRW",
        "image_url": image_url,
        "purchase_url": purchase_url,
        "shipping": None,
        "sustainability_status": "unverified",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat()
    }


def fetch_products(api_url):
    request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "SobiNamu/1.0"
        }
    )

    with urllib.request.urlopen(
        request, timeout=30
    ) as response:
        raw = response.read(8_000_001)

    if len(raw) > 8_000_000:
        raise ValueError("API response too large")

    payload = json.loads(raw.decode("utf-8-sig"))
    return find_items(payload)


def save_products(rows, supabase_url, secret_key):
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/sobi_product_catalog"
        + "?on_conflict=source,source_product_id"
    )

    for start in range(0, len(rows), 100):
        batch = rows[start:start + 100]

        request = urllib.request.Request(
            endpoint,
            data=json.dumps(
                batch, ensure_ascii=False
            ).encode("utf-8"),
            headers={
                "apikey": secret_key,
                "Authorization": "Bearer " + secret_key,
                "Content-Type": "application/json",
                "Prefer": (
                    "resolution=merge-duplicates,"
                    "return=minimal"
                )
            },
            method="POST"
        )

        with urllib.request.urlopen(
            request, timeout=30
        ) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(
                    f"Supabase HTTP {response.status}"
                )


def main():
    api_url = os.environ.get(
        "ADPICK_API_URL", ""
    ).strip()

    parsed = urllib.parse.urlparse(api_url)
    host = (parsed.hostname or "").lower()

    if (
        parsed.scheme != "https"
        or not (
            host == "adpick.co.kr"
            or host.endswith(".adpick.co.kr")
        )
        or parsed.username
        or parsed.password
    ):
        sys.exit(
            "Invalid ADPICK_API_URL configuration"
        )

    try:
        items = fetch_products(api_url)
    except Exception as error:
        sys.exit(
            "Adpick API request failed: "
            + type(error).__name__
        )

    print("Products found:", len(items))

    records = {}

    for item in items:
        row = normalize(item)
        if row:
            records[row["source_product_id"]] = row

    print("Valid products:", len(records))

    if not records:
        if items:
            print(
                "Product fields:",
                sorted(items[0].keys())
            )
        sys.exit(
            "No valid products. Nothing was saved."
        )

    supabase_url = os.environ.get(
        "SUPABASE_URL", ""
    ).strip()

    secret_key = os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    ).strip()

    if not supabase_url.startswith("https://"):
        sys.exit("Missing SUPABASE_URL")

    if not secret_key:
        sys.exit("Missing SUPABASE_SERVICE_ROLE_KEY")

    try:
        save_products(
            list(records.values()),
            supabase_url,
            secret_key
        )
    except urllib.error.HTTPError as error:
        sys.exit(
            f"Supabase save failed: HTTP {error.code}"
        )
    except Exception as error:
        sys.exit(
            "Supabase save failed: "
            + type(error).__name__
        )

    print(
        "Successfully synchronized",
        len(records),
        "products"
    )


if __name__ == "__main__":
    main()
