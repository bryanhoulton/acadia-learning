import phonenumbers
from django.core.exceptions import ValidationError


def is_valid_phone_number(phone_number_string: str) -> None:
    """
    Checks if a phone number string (with country code) is valid.

    Args:
        phone_number_string (str): The phone number string, e.g., "+12025550100".

    Returns:
        bool: True if the phone number is valid, False otherwise.
    """
    try:
        # Parse the phone number string. The library automatically handles country codes.
        parsed_number = phonenumbers.parse(phone_number_string)

        # Check if the parsed number is a possible number (basic length check)
        is_possible = phonenumbers.is_possible_number(parsed_number)

        # Check if the parsed number is a valid number (more thorough validation)
        is_valid = phonenumbers.is_valid_number(parsed_number)
        if not is_possible or not is_valid:
            raise ValidationError("Invalid phone number")

    except phonenumbers.phonenumberutil.NumberParseException:
        # Handle cases where the string cannot be parsed into a phone number
        raise ValidationError("Invalid phone number")
