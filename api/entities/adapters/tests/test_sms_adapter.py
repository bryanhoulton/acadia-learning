from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from django.test import TestCase, tag

from entities.adapters.sms import (
    SmsAdapter,
    SmsListTool,
)
from lms.accounts.models import UserProfile


@tag("fast")
class TestSmsListTool(TestCase):
    def setUp(self):
        self.tool = SmsListTool()
        self.mock_entity_runtime = Mock()
        self.mock_entity = Mock()
        self.mock_entity.time_offset = 0
        self.mock_entity_runtime.entity = self.mock_entity

    @patch("entities.adapters.sms.timezone")
    @patch("entities.adapters.sms.UserProfile.objects")
    @patch("entities.adapters.sms.SMSMessage.objects")
    def test_execute_with_contact_id(self, mock_sms_objects, mock_contact_objects, mock_timezone):
        # Arrange
        mock_contact = Mock()
        mock_contact.phone_number = "+1234567890"
        mock_contact_objects.get.return_value = mock_contact

        mock_now = datetime.now()
        mock_timezone.now.return_value = mock_now

        mock_messages = [Mock(), Mock()]
        mock_sms_objects.filter.return_value.order_by.return_value.__getitem__.return_value = mock_messages

        parameters = {"user_profile_id": "1", "limit": 10}

        # Act
        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Assert
        mock_contact_objects.get.assert_called_once_with(pk="1", account=self.mock_entity.account)
        mock_contact.save.assert_called_once()
        # Check that last_sms_read_time was updated
        expected_time = mock_now + timedelta(minutes=0)  # time_offset is 0
        assert mock_contact.last_sms_read_time == expected_time

    @patch("entities.adapters.sms.UserProfile.objects")
    def test_execute_contact_not_found(self, mock_contact_objects):
        # Arrange
        mock_contact_objects.get.side_effect = UserProfile.DoesNotExist()
        parameters = {"user_profile_id": "999"}

        # Act
        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Assert
        assert result == {"error": "User profile not found"}

    @patch("entities.adapters.sms.timezone")
    @patch("entities.adapters.sms.UserProfile.objects")
    @patch("entities.adapters.sms.SMSMessage.objects")
    def test_execute_without_contact_id(self, mock_sms_objects, mock_contact_objects, mock_timezone):
        # Arrange
        mock_contacts = [Mock(phone_number="+1111111111"), Mock(phone_number="+2222222222")]
        mock_contact_queryset = Mock()
        mock_contact_queryset.values_list.return_value = ["+1111111111", "+2222222222"]
        mock_contact_queryset.__iter__ = Mock(return_value=iter(mock_contacts))
        mock_contact_objects.filter.return_value = mock_contact_queryset

        mock_now = datetime.now()
        mock_timezone.now.return_value = mock_now

        mock_messages = [Mock(), Mock()]
        mock_sms_objects.filter.return_value.order_by.return_value.__getitem__.return_value = mock_messages

        parameters = {"limit": 5}

        # Act
        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Assert
        mock_contact_objects.filter.assert_called_with(account=self.mock_entity.account)
        # Check that all contacts had their last_sms_read_time updated
        for contact in mock_contacts:
            contact.save.assert_called()

    def test_tool_schema(self):
        # Test that the tool has correct schema properties
        assert self.tool.name == "sms_list"
        assert "user_profile_id" in self.tool.parameters
        assert "limit" in self.tool.parameters
        assert self.tool.parameters["user_profile_id"]["type"] == "string"
        assert self.tool.parameters["limit"]["type"] == "integer"

    @patch("entities.adapters.sms.timezone")
    @patch("entities.adapters.sms.UserProfile.objects")
    @patch("entities.adapters.sms.SMSMessage.objects")
    def test_execute_with_time_offset(self, mock_sms_objects, mock_contact_objects, mock_timezone):
        # Arrange
        self.mock_entity.time_offset = 60  # 60 minutes offset

        mock_contact = Mock()
        mock_contact.phone_number = "+1234567890"
        mock_contact_objects.get.return_value = mock_contact

        mock_now = datetime.now()
        mock_timezone.now.return_value = mock_now

        mock_messages = []
        mock_sms_objects.filter.return_value.order_by.return_value.__getitem__.return_value = mock_messages

        parameters = {"user_profile_id": "1"}

        # Act
        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Assert
        expected_time = mock_now + timedelta(minutes=60)
        assert mock_contact.last_sms_read_time == expected_time

    def test_tool_parameter_validation(self):
        # Test that the tool validates its parameters correctly
        assert self.tool.name == "sms_list"
        assert "user_profile_id" in self.tool.parameters
        assert "limit" in self.tool.parameters


@tag("fast")
class TestSmsAdapter(TestCase):
    def setUp(self):
        self.adapter = SmsAdapter()

    def test_adapter_properties(self):
        # Test adapter basic properties
        assert self.adapter.name == "sms"
        assert "sms messages" in self.adapter.description.lower()
        assert len(self.adapter.tools) >= 1  # At least the SmsListTool

    def test_adapter_contains_sms_list_tool(self):
        # Test that adapter contains the SmsListTool
        tool_names = [tool.name for tool in self.adapter.tools]
        assert "sms_list" in tool_names, "SmsListTool not found in adapter"

    def test_sms_list_tool_instance(self):
        # Test that the SmsListTool is properly instantiated
        sms_list_tools = [tool for tool in self.adapter.tools if tool.name == "sms_list"]
        assert len(sms_list_tools) == 1
        assert isinstance(sms_list_tools[0], SmsListTool)
