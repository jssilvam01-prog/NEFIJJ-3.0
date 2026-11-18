from django.db.models import F, Q

from .models import Organization, OrganizationMembership


def active_memberships(user, role=None):
    memberships = OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        organization__status=Organization.Status.ACTIVE,
    ).filter(
        Q(location__isnull=True)
        | Q(
            location__is_active=True,
            location__organization_id=F('organization_id'),
        )
    )
    if role:
        memberships = memberships.filter(role=role)
    return memberships


def active_organization_admin_ids(user):
    return active_memberships(
        user,
        OrganizationMembership.Role.ORGANIZATION_ADMIN,
    ).values_list('organization_id', flat=True)


def has_active_location_membership(user, role, location=None):
    if location is None:
        location = user.location
    if location is None or not location.is_active:
        return False
    return active_memberships(user, role).filter(
        organization_id=location.organization_id,
        location_id=location.pk,
    ).exists()
