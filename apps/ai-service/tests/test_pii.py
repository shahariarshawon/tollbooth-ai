from app.security.pii import find_pii


def test_finds_nothing_in_ordinary_text():
    assert find_pii("Please summarize this document for me.") == []


def test_masks_the_value_in_the_preview():
    matches = find_pii("Email me at jane.doe@example.com")
    assert len(matches) == 1
    assert matches[0].type == "email"
    assert "jane.doe@example.com" not in matches[0].preview
    assert matches[0].preview.startswith("ja")
    assert matches[0].preview.endswith("om")


def test_one_match_per_type_even_with_repeats():
    matches = find_pii("Emails: a@example.com and b@example.com and c@example.com")
    assert len([m for m in matches if m.type == "email"]) == 1


def test_finds_several_pii_types_in_one_text():
    text = "Reach me at a@example.com or 415-555-2671, card 4111 1111 1111 1111."
    types = {m.type for m in find_pii(text)}
    assert types == {"email", "phone_number", "credit_card"}
