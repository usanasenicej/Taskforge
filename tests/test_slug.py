from app.services.slug import slugify


def test_slugify_basic():
    assert slugify("Acme Corp") == "acme-corp"


def test_slugify_strips_punctuation_and_unicode():
    assert slugify("  Café — 2024!! ") == "cafe-2024"


def test_slugify_falls_back_when_empty():
    assert slugify("") == "org"
    assert slugify("@@@") == "org"
