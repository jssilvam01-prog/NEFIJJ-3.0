from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AcceptOrganizationInvitationView,
    ChangePasswordView,
    LoginView,
    ManagedOrganizationsView,
    OrganizationAdminListCreateView,
    OrganizationAdminStatusView,
    OrganizationInvitationListCreateView,
    OrganizationInvitationRevealView,
    OrganizationInvitationRevokeView,
    OrganizationUserListView,
    OrganizationUserPasswordResetView,
    ProfileView,
    RegisterWithInvitationView,
    TechnicianListCreateView,
    TechnicianPasswordResetView,
)

urlpatterns = [
    path('token/', LoginView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', RegisterWithInvitationView.as_view(), name='register_with_invitation'),
    path('me/', ProfileView.as_view(), name='profile'),
    path('my-organizations/', ManagedOrganizationsView.as_view(), name='managed_organizations'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('organization-admins/', OrganizationAdminListCreateView.as_view(), name='organization_admins'),
    path(
        'organization-admins/<int:user_id>/',
        OrganizationAdminStatusView.as_view(),
        name='organization_admin_status',
    ),
    path(
        'organization-admins/<int:user_id>/password/',
        OrganizationAdminStatusView.as_view(),
        name='organization_admin_password',
    ),
    path('technicians/', TechnicianListCreateView.as_view(), name='technicians'),
    path(
        'technicians/<int:user_id>/password/',
        TechnicianPasswordResetView.as_view(),
        name='technician_password',
    ),
    path('technicians/<int:user_id>/', TechnicianListCreateView.as_view(), name='technician_status'),
    path('users/', OrganizationUserListView.as_view(), name='organization_users'),
    path(
        'users/<int:user_id>/password/',
        OrganizationUserPasswordResetView.as_view(),
        name='organization_user_password',
    ),
    path(
        'invitations/accept/',
        AcceptOrganizationInvitationView.as_view(),
        name='accept_organization_invitation',
    ),
    path(
        'organization-invitations/',
        OrganizationInvitationListCreateView.as_view(),
        name='organization_invitations',
    ),
    path(
        'organization-invitations/<int:pk>/reveal/',
        OrganizationInvitationRevealView.as_view(),
        name='reveal_organization_invitation',
    ),
    path(
        'organization-invitations/<int:pk>/revoke/',
        OrganizationInvitationRevokeView.as_view(),
        name='revoke_organization_invitation',
    ),
]
