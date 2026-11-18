import hashlib
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework.test import APITestCase

from .invitation_tokens import add_business_days
from .models import (
    Location,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    User,
)


class PasswordChangeTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Organización de prueba')
        self.location = Location.objects.create(
            organization=self.organization,
            name='Sede de prueba',
            code='TEST-1',
        )
        self.user = User.objects.create_user(
            username='student',
            email='student@example.test',
            password='Old-Secure-Pass-934!',
            role=User.Role.STUDENT,
            location=self.location,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            location=self.location,
            user=self.user,
            role=OrganizationMembership.Role.USER,
        )
        self.client.force_authenticate(self.user)

    def test_login_returns_jwt_and_normalized_role(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            '/api/v1/auth/token/',
            {'username': 'student', 'password': 'Old-Secure-Pass-934!'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], 'user')

    def test_password_change_requires_current_password_and_matching_confirmation(self):
        response = self.client.post(
            '/api/v1/auth/change-password/',
            {
                'current_password': 'wrong-password',
                'new_password': 'New-Secure-Pass-372!',
                'new_password_confirm': 'New-Secure-Pass-372!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Old-Secure-Pass-934!'))

        response = self.client.post(
            '/api/v1/auth/change-password/',
            {
                'current_password': 'Old-Secure-Pass-934!',
                'new_password': 'New-Secure-Pass-372!',
                'new_password_confirm': 'New-Secure-Pass-372!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('New-Secure-Pass-372!'))


class OrganizationInvitationTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Organización invitaciones')
        self.location = Location.objects.create(
            organization=self.organization,
            name='Sede invitaciones',
            code='INVITE-1',
        )
        self.admin = User.objects.create_user(
            username='invite-admin',
            email='invite-admin@example.test',
            password='Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=self.admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )

    def create_invitation(self):
        self.client.force_authenticate(self.admin)
        return self.client.post(
            '/api/v1/auth/organization-invitations/',
            {'location_id': self.location.pk},
            format='json',
        )

    def test_invitation_is_hashed_scoped_and_links_an_existing_student_once(self):
        response = self.create_invitation()

        self.assertEqual(response.status_code, 201)
        code = response.data['code']
        invitation = OrganizationInvitation.objects.get(pk=response.data['id'])
        self.assertEqual(invitation.token_hash, hashlib.sha256(code.encode()).hexdigest())
        self.assertNotEqual(invitation.token_hash, code)
        self.assertEqual(invitation.location, self.location)
        self.assertLess(
            invitation.expires_at.astimezone(ZoneInfo('America/Bogota')).weekday(),
            5,
        )

        student = User.objects.create_user(
            username='unlinked-student',
            email='unlinked-student@example.test',
            password='Student-Secure-193!',
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(student)
        response = self.client.post(
            '/api/v1/auth/invitations/accept/',
            {'code': code},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                user=student,
                organization=self.organization,
                location=self.location,
                role=OrganizationMembership.Role.USER,
                is_active=True,
            ).exists()
        )
        student.refresh_from_db()
        self.assertEqual(student.location, self.location)

        response = self.client.post(
            '/api/v1/auth/invitations/accept/',
            {'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_invitation_expires_after_seven_weekdays_and_can_be_revoked(self):
        response = self.create_invitation()
        self.assertEqual(response.status_code, 201)
        code = response.data['code']
        invitation = OrganizationInvitation.objects.get(pk=response.data['id'])
        expected_expiry = add_business_days(invitation.created_at, 7)
        self.assertEqual(invitation.expires_at.weekday(), expected_expiry.weekday())
        self.assertLessEqual(
            abs((invitation.expires_at - expected_expiry).total_seconds()),
            2,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f'/api/v1/auth/organization-invitations/{invitation.pk}/revoke/',
            format='json',
        )
        self.assertEqual(response.status_code, 204)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.revoked_at)

        student = User.objects.create_user(
            username='revoked-student',
            email='revoked-student@example.test',
            password='Student-Secure-293!',
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(student)
        response = self.client.post(
            '/api/v1/auth/invitations/accept/',
            {'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_expired_invitation_cannot_link_a_student(self):
        response = self.create_invitation()
        code = response.data['code']
        invitation = OrganizationInvitation.objects.get(pk=response.data['id'])
        invitation.expires_at = timezone.now()
        invitation.save(update_fields=['expires_at'])

        student = User.objects.create_user(
            username='expired-student',
            email='expired-student@example.test',
            password='Student-Secure-393!',
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(student)
        response = self.client.post(
            '/api/v1/auth/invitations/accept/',
            {'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_invitation_is_not_visible_or_revocable_outside_its_organization(self):
        response = self.create_invitation()
        invitation_id = response.data['id']
        other_organization = Organization.objects.create(name='Otra organización')
        other_admin = User.objects.create_user(
            username='other-admin',
            email='other-admin@example.test',
            password='Other-Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=other_organization,
            user=other_admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        self.client.force_authenticate(other_admin)

        response = self.client.get('/api/v1/auth/organization-invitations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        response = self.client.post(
            f'/api/v1/auth/organization-invitations/{invitation_id}/revoke/',
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_admin_cannot_create_invitation_for_another_organization(self):
        other_organization = Organization.objects.create(name='Organización ajena')
        other_location = Location.objects.create(
            organization=other_organization,
            name='Sede ajena',
            code='INVITE-OTHER',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            '/api/v1/auth/organization-invitations/',
            {'location_id': other_location.pk},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(OrganizationInvitation.objects.exists())

    def test_suspended_organization_invitation_cannot_be_accepted(self):
        response = self.create_invitation()
        code = response.data['code']
        self.organization.status = Organization.Status.SUSPENDED
        self.organization.save(update_fields=['status'])
        student = User.objects.create_user(
            username='suspended-tenant-student',
            email='suspended-tenant-student@example.test',
            password='Student-Secure-493!',
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(student)

        response = self.client.post(
            '/api/v1/auth/invitations/accept/',
            {'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            OrganizationMembership.objects.filter(
                user=student,
                organization=self.organization,
            ).exists()
        )

    def test_superadmin_can_create_and_suspend_organizations(self):
        superadmin = User.objects.create_superuser(
            username='platform-admin',
            email='platform-admin@example.test',
            password='Platform-Secure-193!',
        )
        self.client.force_authenticate(superadmin)
        response = self.client.post(
            '/api/v1/organizations/',
            {'name': 'Nueva organización'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        organization_id = response.data['id']
        response = self.client.patch(
            f'/api/v1/organizations/{organization_id}/',
            {'status': Organization.Status.SUSPENDED},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        organization = Organization.objects.get(pk=organization_id)
        self.assertEqual(organization.status, Organization.Status.SUSPENDED)


class StaffManagementTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Organización de personal')
        self.location = Location.objects.create(
            organization=self.organization,
            name='Sede de personal',
            code='STAFF-1',
        )
        self.other_organization = Organization.objects.create(name='Otra organización')
        self.other_location = Location.objects.create(
            organization=self.other_organization,
            name='Sede ajena',
            code='STAFF-2',
        )
        self.admin = User.objects.create_user(
            username='staff-admin',
            email='staff-admin@example.test',
            password='Staff-Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=self.admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        self.superadmin = User.objects.create_superuser(
            username='staff-superadmin',
            email='staff-superadmin@example.test',
            password='Staff-Superadmin-Secure-193!',
        )

    def test_superadmin_creates_an_organization_admin_for_an_active_tenant(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            '/api/v1/auth/organization-admins/',
            {
                'username': 'new-org-admin',
                'email': 'new-org-admin@example.test',
                'password': 'Unique-Organization-Admin-193!',
                'organization_id': self.organization.pk,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn('password', response.data)
        user = User.objects.get(username='new-org-admin')
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                user=user,
                organization=self.organization,
                role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
                is_active=True,
                location__isnull=True,
            ).exists()
        )
        response = self.client.patch(
            f'/api/v1/auth/organization-admins/{user.pk}/',
            {'organization_id': self.organization.pk, 'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        response = self.client.patch(
            f'/api/v1/auth/organization-admins/{user.pk}/',
            {'organization_id': self.organization.pk, 'is_active': True},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_active)

        # Superadmin can change the admin's password
        response = self.client.put(
            f'/api/v1/auth/organization-admins/{user.pk}/',
            {
                'new_password': 'Brand-New-Admin-Password-193!',
                'new_password_confirm': 'Brand-New-Admin-Password-193!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Brand-New-Admin-Password-193!'))

        # Also via /password/ endpoint
        response = self.client.post(
            f'/api/v1/auth/organization-admins/{user.pk}/password/',
            {
                'new_password': 'Another-New-Admin-Password-193!',
                'new_password_confirm': 'Another-New-Admin-Password-193!',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Another-New-Admin-Password-193!'))

        # Non-superadmin cannot change password
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            f'/api/v1/auth/organization-admins/{user.pk}/',
            {'new_password': 'Hacked-Password-193!'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

        # Superadmin can delete the admin
        self.client.force_authenticate(self.superadmin)
        response = self.client.delete(f'/api/v1/auth/organization-admins/{user.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())

    def test_organization_admin_creates_a_technician_only_in_its_own_location(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            '/api/v1/auth/technicians/',
            {
                'username': 'new-technician',
                'email': 'new-technician@example.test',
                'password': 'Unique-Technician-193!',
                'location_id': self.location.pk,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn('password', response.data)
        technician = User.objects.get(username='new-technician')
        self.assertEqual(technician.location, self.location)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                user=technician,
                organization=self.organization,
                location=self.location,
                role=OrganizationMembership.Role.TECHNICIAN,
                is_active=True,
            ).exists()
        )
        response = self.client.patch(
            f'/api/v1/auth/technicians/{technician.pk}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        technician.refresh_from_db()
        self.assertFalse(technician.is_active)
        response = self.client.patch(
            f'/api/v1/auth/technicians/{technician.pk}/',
            {'is_active': True},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        technician.refresh_from_db()
        self.assertTrue(technician.is_active)

        response = self.client.post(
            '/api/v1/auth/technicians/',
            {
                'username': 'foreign-technician',
                'email': 'foreign-technician@example.test',
                'password': 'Unique-Technician-293!',
                'location_id': self.other_location.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='foreign-technician').exists())

    def test_non_superadmin_cannot_create_organization_admins(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            '/api/v1/auth/organization-admins/',
            {
                'username': 'forbidden-admin',
                'email': 'forbidden-admin@example.test',
                'password': 'Unique-Forbidden-Admin-193!',
                'organization_id': self.organization.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_and_deactivate_a_location_only_in_its_tenant(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            '/api/v1/locations/',
            {
                'name': 'Sede nueva',
                'code': 'STAFF-NEW',
                'organization_id': self.organization.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        location_id = response.data['id']
        self.assertEqual(response.data['organization'], self.organization.name)

        response = self.client.patch(
            f'/api/v1/locations/{location_id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])

        response = self.client.post(
            '/api/v1/locations/',
            {
                'name': 'Sede ajena',
                'code': 'STAFF-FOREIGN',
                'organization_id': self.other_organization.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
