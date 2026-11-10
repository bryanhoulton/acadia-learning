def possibly_split(value: str | None) -> list[str]:
    """Split a string by comma if it contains one, otherwise return as single item list."""
    if value is None:
        return []
    if "," not in value:
        return [value]
    return value.split(",")


def safe_delete(data: dict, *args):
    """Delete a key from a dictionary if it exists."""
    for k in args:
        if k in data:
            del data[k]
    return data
