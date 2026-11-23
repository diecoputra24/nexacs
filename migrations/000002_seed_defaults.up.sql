-- Seed Default Tenant, RBAC Roles & Permissions, Manufacturers, Data Models, Canonical Keys, and Settings

-- Default ISP Tenant
INSERT INTO tenants (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'NexaNet ISP Operations', 'nexanet-isp', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Permissions (includes Section 8.3 high-risk permissions)
INSERT INTO permissions (code, description, is_high_risk) VALUES
    ('overview.view', 'View overview dashboard and statistics', FALSE),
    ('devices.view', 'View device inventory and non-secret parameters', FALSE),
    ('devices.summon', 'Trigger Summon and parameter refresh tasks', FALSE),
    ('devices.parameters.write', 'Modify writable device parameters and WiFi settings', FALSE),
    ('devices.secrets.view', 'Reveal masked modem, WiFi, and Connection Request passwords', TRUE),
    ('devices.credentials.edit', 'Update or rotate device and Connection Request credentials', TRUE),
    ('devices.reboot', 'Reboot CPE/ONT devices remotely', TRUE),
    ('devices.factory_reset', 'Execute Factory Reset on CPE/ONT devices', TRUE),
    ('devices.delete', 'Soft delete or archive devices from platform', TRUE),
    ('faults.view', 'View device and operation faults', FALSE),
    ('faults.manage', 'Acknowledge, resolve, and safely retry faults', FALSE),
    ('firmware.view', 'View firmware images and rollout jobs', FALSE),
    ('firmware.deploy', 'Upload firmware and execute firmware deployments', TRUE),
    ('security.users.manage', 'Manage users, roles, and RBAC permission matrix', TRUE),
    ('security.trust.manage', 'Manage certificates, enrollment allowlists, and USP trust', TRUE),
    ('security.audit.view', 'View platform audit and login history logs', FALSE),
    ('settings.view', 'View system settings and thresholds', FALSE),
    ('settings.manage', 'Modify system settings, thresholds, and manufacturer aliases', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Default Roles for Default Tenant
INSERT INTO roles (id, tenant_id, name, description, is_system) VALUES
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Super Admin', 'Full administrative control including destructive actions and secrets', TRUE),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'NOC Engineer', 'Full troubleshooting, summon, reboot, firmware, and fault resolution without user/role administration', TRUE),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Technician', 'Field & helpdesk operations: summon, parameter read, WiFi edit, reboot; no secrets reveal or factory reset', TRUE),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Viewer', 'Read-only access to dashboard, devices, and faults', TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Grant all permissions to Super Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000101', id FROM permissions
ON CONFLICT DO NOTHING;

-- Grant NOC Engineer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000102', id FROM permissions
WHERE code IN (
    'overview.view', 'devices.view', 'devices.summon', 'devices.parameters.write',
    'devices.secrets.view', 'devices.reboot', 'faults.view', 'faults.manage',
    'firmware.view', 'firmware.deploy', 'security.audit.view', 'settings.view'
)
ON CONFLICT DO NOTHING;

-- Grant Technician permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000103', id FROM permissions
WHERE code IN (
    'overview.view', 'devices.view', 'devices.summon', 'devices.parameters.write',
    'devices.reboot', 'faults.view', 'faults.manage', 'firmware.view', 'settings.view'
)
ON CONFLICT DO NOTHING;

-- Grant Viewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000104', id FROM permissions
WHERE code IN ('overview.view', 'devices.view', 'faults.view', 'firmware.view', 'settings.view')
ON CONFLICT DO NOTHING;

-- Seed Manufacturer Aliases (Blueprint Section 3.7)
INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence) VALUES
    (NULL, 'ZTE', 'ZTE', '', 'seed', 'high'),
    (NULL, 'ZTE Corporation', 'ZTE', '00259E', 'seed', 'high'),
    (NULL, 'Huawei', 'Huawei', '', 'seed', 'high'),
    (NULL, 'Huawei Technologies Co., Ltd', 'Huawei', '00E0FC', 'seed', 'high'),
    (NULL, 'Fiberhome', 'Fiberhome', '', 'seed', 'high'),
    (NULL, 'FiberHome Telecommunication Technologies', 'Fiberhome', '000AC2', 'seed', 'high'),
    (NULL, 'GM', 'GM', '', 'seed', 'medium'),
    (NULL, 'GlobalMedia', 'GM', '', 'seed', 'medium'),
    (NULL, 'Xtetch', 'Xtetch', '', 'seed', 'medium'),
    (NULL, 'Bnetfit', 'Bnetfit', '', 'seed', 'medium'),
    (NULL, 'Dual Band', 'Dual Band', '', 'seed', 'low'),
    (NULL, 'D-Link', 'D-Link', '', 'seed', 'high'),
    (NULL, 'D-Link Corporation', 'D-Link', '1C7EE5', 'seed', 'high'),
    (NULL, 'TP-Link', 'TP-Link', '', 'seed', 'high'),
    (NULL, 'TP-LINK Technologies', 'TP-Link', '50C7BF', 'seed', 'high'),
    (NULL, 'Nokia', 'Nokia', '', 'seed', 'high'),
    (NULL, 'ALCL', 'Nokia', '0019E3', 'seed', 'high'),
    (NULL, 'VSOL', 'VSOL', '', 'seed', 'high'),
    (NULL, 'V-SOLUTION', 'VSOL', '487A55', 'seed', 'high'),
    (NULL, 'Raisecom', 'Raisecom', '', 'seed', 'high'),
    (NULL, 'Raisecom Technology', 'Raisecom', '000E5E', 'seed', 'high')
ON CONFLICT DO NOTHING;

-- Data Models
INSERT INTO data_models (id, name, version, root_object, description) VALUES
    ('00000000-0000-0000-0000-000000000201', 'TR-098', '1.4', 'InternetGatewayDevice.', 'Broadband Forum TR-098 Internet Gateway Device Data Model'),
    ('00000000-0000-0000-0000-000000000202', 'TR-181', '2.16', 'Device.', 'Broadband Forum TR-181 Device:2 Data Model')
ON CONFLICT (name, version) DO NOTHING;

-- Canonical Parameter Definitions (Blueprint Section 10.2)
INSERT INTO parameter_definitions (canonical_key, group_name, value_type, unit, is_secret, description) VALUES
    ('device.serial_number', 'device_info', 'string', '', FALSE, 'Device Serial Number'),
    ('device.manufacturer', 'device_info', 'string', '', FALSE, 'Device Manufacturer'),
    ('device.oui', 'device_info', 'string', '', FALSE, 'Organizationally Unique Identifier'),
    ('device.product_class', 'device_info', 'string', '', FALSE, 'Product Class from protocol Inform'),
    ('device.model_name', 'device_info', 'string', '', FALSE, 'Hardware Model Name'),
    ('device.hardware_version', 'device_info', 'string', '', FALSE, 'Hardware Version'),
    ('device.software_version', 'device_info', 'string', '', FALSE, 'Firmware / Software Version'),
    ('device.uptime_seconds', 'device_health', 'unsignedInt', 's', FALSE, 'Device UpTime in seconds'),
    ('device.temperature_celsius', 'device_health', 'float', '°C', FALSE, 'Optical module or SoC temperature in Celsius'),
    ('optical.rx_power_dbm', 'device_health', 'float', 'dBm', FALSE, 'Optical Receive Power in dBm'),
    ('management.connection_request_url', 'management', 'string', '', FALSE, 'CWMP Connection Request URL'),
    ('management.periodic_inform_interval', 'management', 'unsignedInt', 's', FALSE, 'Periodic Inform interval in seconds'),
    ('wan.external_ip', 'wan', 'string', '', FALSE, 'Reported WAN External IP Address'),
    ('wan.pppoe_username', 'wan', 'string', '', FALSE, 'WAN PPPoE Username'),
    ('wan.pppoe_password', 'wan', 'string', '', TRUE, 'WAN PPPoE Password'),
    ('wifi.ssid', 'wifi', 'string', '', FALSE, 'Primary WiFi SSID'),
    ('wifi.security_key', 'wifi', 'string', '', TRUE, 'Primary WiFi Pre-Shared Key')
ON CONFLICT (canonical_key) DO NOTHING;

-- Generic TR-098 & TR-181 Parameter Mappings
INSERT INTO model_parameter_mappings (model_id, data_model_id, protocol, canonical_key, parameter_path, value_type, unit, read_write, priority) VALUES
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.serial_number', 'InternetGatewayDevice.DeviceInfo.SerialNumber', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.manufacturer', 'InternetGatewayDevice.DeviceInfo.Manufacturer', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.model_name', 'InternetGatewayDevice.DeviceInfo.ModelName', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.hardware_version', 'InternetGatewayDevice.DeviceInfo.HardwareVersion', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.software_version', 'InternetGatewayDevice.DeviceInfo.SoftwareVersion', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'device.uptime_seconds', 'InternetGatewayDevice.DeviceInfo.UpTime', 'unsignedInt', 's', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'management.connection_request_url', 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000201', 'TR-069', 'management.periodic_inform_interval', 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval', 'unsignedInt', 's', 'RW', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.serial_number', 'Device.DeviceInfo.SerialNumber', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.manufacturer', 'Device.DeviceInfo.Manufacturer', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.model_name', 'Device.DeviceInfo.ModelName', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.hardware_version', 'Device.DeviceInfo.HardwareVersion', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.software_version', 'Device.DeviceInfo.SoftwareVersion', 'string', '', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'device.uptime_seconds', 'Device.DeviceInfo.UpTime', 'unsignedInt', 's', 'R', 10),
    (NULL, '00000000-0000-0000-0000-000000000202', 'TR-069', 'management.connection_request_url', 'Device.ManagementServer.ConnectionRequestURL', 'string', '', 'R', 10);

-- Default System Settings
INSERT INTO system_settings (tenant_id, category, settings) VALUES
    ('00000000-0000-0000-0000-000000000001', 'general', '{"system_name": "NexaACS", "timezone": "Asia/Jakarta", "date_format": "YYYY-MM-DD HH:mm:ss", "default_page_size": 25, "retention_days": 90}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'device_status', '{"online_threshold_seconds": 1800, "periodic_inform_expectation_seconds": 900, "never_connected_policy": "separate_bucket", "recalculation_interval_seconds": 60}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'classification', '{"temp_warning_c": 45, "temp_critical_c": 55, "rx_strong_min_dbm": -12, "rx_good_min_dbm": -20, "rx_attention_min_dbm": -24, "rx_weak_min_dbm": -27}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'protocol', '{"cwmp_endpoint": "https://cwmp.example.net/cwmp", "cwmp_versions": ["1.0", "1.1", "1.2", "1.4"], "session_timeout_seconds": 60, "connection_request_timeout_seconds": 10, "usp_controller_id": "proto::nexaacs-controller", "usp_mtp": "mqtt"}'::jsonb)
ON CONFLICT (tenant_id, category) DO NOTHING;
