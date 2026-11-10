from rest_framework.permissions import BasePermission, IsAuthenticated

from entities.permissions import EntityOnlyPermission


class IsAdminPermission(BasePermission):
    """
    Permission that requires the user to be an admin.
    """

    def has_permission(self, request, view):
        if not IsAuthenticated().has_permission(request, view):
            return False
        return hasattr(request, "account") and request.account is not None and request.account.is_admin


class IsAuthenticatedAndSelected(BasePermission):
    """
    Permission that requires IsAuthenticated and a selected profile.
    """

    def has_permission(self, request, view):
        return IsAuthenticated().has_permission(request, view) and request.profile is not None


class EntityOrIsAuthenticatedPermission(BasePermission):
    """
    Permission that requires either EntityOnlyPermission or IsAuthenticated to be True.
    """

    def has_permission(self, request, view):
        entity_permission = EntityOnlyPermission()
        is_authenticated_permission = IsAuthenticated()
        return entity_permission.has_permission(request, view) or is_authenticated_permission.has_permission(
            request, view
        )


class EntityOrIsAuthenticatedAndSelectedPermission(BasePermission):
    """
    Permission that requires either EntityOnlyPermission or IsAuthenticatedAndSelected to be True.
    """

    def has_permission(self, request, view):
        entity_permission = EntityOnlyPermission()
        is_authenticated_and_selected_permission = IsAuthenticatedAndSelected()
        return entity_permission.has_permission(
            request, view
        ) or is_authenticated_and_selected_permission.has_permission(request, view)
