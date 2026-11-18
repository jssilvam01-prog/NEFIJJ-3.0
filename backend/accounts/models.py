from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


class Organization(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Activa'
        SUSPENDED = 'suspended', 'Suspendida'

    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts_organization'
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:180]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Location(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='locations',
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts_location'
        ordering = ['organization__name', 'name']

    def __str__(self):
        return f'{self.organization}: {self.name}'


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('role', User.Role.SUPERADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractBaseUser):
    class Role(models.TextChoices):
        STUDENT = 'student', 'Usuario'
        TECHNICIAN = 'technician', 'Técnico'
        ADMIN = 'admin', 'Administrador de organización'
        SUPERADMIN = 'superadmin', 'Superadministrador'

    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(unique=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_superuser = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )

    objects = UserManager()
    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'accounts_user'

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def get_short_name(self):
        return self.first_name or self.username

    @property
    def effective_role(self):
        if self.is_superuser:
            return 'superadmin'

        membership_roles = set(
            self.organization_memberships.filter(is_active=True).values_list('role', flat=True)
        )
        if 'organization_admin' in membership_roles or self.role == self.Role.ADMIN:
            return 'organization_admin'
        if 'technician' in membership_roles or self.role == self.Role.TECHNICIAN:
            return 'technician'
        return 'user'

    def clean(self):
        super().clean()
        if self.role in {self.Role.STUDENT, self.Role.TECHNICIAN} and not self.location_id:
            raise ValidationError({'location': 'Este rol requiere una sede.'})

    def __str__(self):
        return self.username


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        USER = 'user', 'Usuario'
        TECHNICIAN = 'technician', 'Técnico'
        ORGANIZATION_ADMIN = 'organization_admin', 'Administrador de organización'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='memberships',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='organization_memberships',
    )
    role = models.CharField(max_length=30, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts_organizationmembership'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'user'],
                name='unique_user_organization_membership',
            ),
        ]

    def clean(self):
        super().clean()
        if self.location_id and self.location.organization_id != self.organization_id:
            raise ValidationError({'location': 'La sede debe pertenecer a la organización.'})

    def __str__(self):
        return f'{self.user}: {self.organization} ({self.role})'


class OrganizationInvitation(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='invitations',
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name='invitations',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_organization_invitations',
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)


    used_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='accepted_organization_invitations',
    )

    class Meta:
        db_table = 'accounts_organizationinvitation'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.organization}: {self.location} ({self.pk})'
