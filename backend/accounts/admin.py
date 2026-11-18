from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Location, Organization, OrganizationMembership, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'status', 'created_at']
    search_fields = ['name', 'slug']


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'organization', 'is_active']
    list_filter = ['organization']
    search_fields = ['name', 'organization__name']


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'location', 'role', 'is_active']
    list_filter = ['organization', 'role', 'is_active']
    search_fields = ['user__username', 'organization__name']


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Información personal', {'fields': ('first_name', 'last_name', 'email')}),
        ('Organización', {'fields': ('role', 'location')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Fechas', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'username',
                'email',
                'password1',
                'password2',
                'role',
                'location',
                'is_staff',
                'is_superuser',
            ),
        }),
    )
    filter_horizontal = ()
    readonly_fields = ['last_login', 'date_joined']
    list_display = ['username', 'email', 'role', 'location', 'is_staff']
    list_filter = ['role', 'location', 'is_staff']
    search_fields = ['username', 'email']
