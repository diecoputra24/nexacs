import { z } from 'zod';

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return 'Data input tidak valid.';
  return first.message;
}

export function extractZodFieldErrors(err: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !map[key]) {
      map[key] = issue.message;
    }
  }
  return map;
}

export const loginFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Username minimal 2 karakter.')
    .max(120, 'Username maksimal 120 karakter.')
    .refine((v) => !/\s/.test(v), 'Username tidak boleh mengandung spasi.'),
  password: z
    .string()
    .min(1, 'Password wajib diisi.')
    .max(128, 'Password maksimal 128 karakter.'),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Username minimal 2 karakter.')
    .max(64, 'Username maksimal 64 karakter.')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh huruf, angka, titik (.), underscore (_), atau minus (-).'),
  password: z
    .string()
    .min(4, 'Password minimal 4 karakter.')
    .max(128, 'Password maksimal 128 karakter.'),
  role: z.enum(['Super Admin', 'NOC Engineer', 'Technician', 'Viewer']),
  status: z.enum(['active', 'disabled']),
});

export const updateUserSchema = z.object({
  password: z
    .string()
    .max(128, 'Password maksimal 128 karakter.')
    .refine((v) => v === '' || v.length >= 4, 'Password baru minimal 4 karakter.')
    .optional()
    .default(''),
  role: z.enum(['Super Admin', 'NOC Engineer', 'Technician', 'Viewer']),
  status: z.enum(['active', 'disabled']),
});

export const provisioningFormSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .min(3, 'Serial Number minimal 3 karakter.')
        .max(64, 'Serial Number maksimal 64 karakter.')
        .regex(/^[A-Z0-9._-]+$/, 'Serial Number hanya boleh huruf, angka, titik, underscore, atau minus.'),
    ),
  oui: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === '' || /^[0-9A-F]{6}$/.test(v), 'OUI harus 6 karakter hex (contoh: 00E0FC).'),
  manufacturer: z.string().trim().max(64, 'Manufacturer maksimal 64 karakter.'),
  wanIndex: z.coerce
    .number({ error: 'WAN Index harus berupa angka.' })
    .int('WAN Index harus bilangan bulat.')
    .min(1, 'WAN Index minimal 1.')
    .max(64, 'WAN Index maksimal 64.'),
  vlanId: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 4094), 'VLAN ID harus antara 1 sampai 4094.'),
  pppoeUsername: z.string().trim().max(128, 'PPPoE Username maksimal 128 karakter.'),
  pppoePassword: z.string().max(128, 'PPPoE Password maksimal 128 karakter.'),
  wifiIndex: z.coerce
    .number({ error: 'WiFi Index harus berupa angka.' })
    .int('WiFi Index harus bilangan bulat.')
    .min(1, 'WiFi Index minimal 1.')
    .max(64, 'WiFi Index maksimal 64.'),
  ssid: z.string().trim().max(32, 'WiFi SSID maksimal 32 karakter.'),
  ssidKey: z
    .string()
    .refine((v) => v === '' || (v.length >= 8 && v.length <= 63), 'WiFi Passphrase harus 8–63 karakter.'),
  wifiEnabled: z.boolean(),
  periodicInformInterval: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 10 && v <= 86400),
      'Periodic Inform Interval harus antara 10 sampai 86400 detik.',
    ),
  autoApplyOnBoot: z.boolean(),
});

export const firmwareUploadSchema = z.object({
  manufacturer: z.string().trim().min(1, 'Manufacturer wajib diisi.').max(64, 'Manufacturer maksimal 64 karakter.'),
  modelName: z.string().trim().min(1, 'Model Name wajib diisi.').max(64, 'Model Name maksimal 64 karakter.'),
  productClass: z.string().trim().max(64, 'Product Class maksimal 64 karakter.'),
  hardwareRevision: z.string().trim().max(64, 'Hardware Revision maksimal 64 karakter.'),
  version: z.string().trim().min(1, 'Firmware Version wajib diisi.').max(64, 'Firmware Version maksimal 64 karakter.'),
  fileName: z.string().trim().min(1, 'File firmware wajib dipilih/diisi.').max(200, 'Nama file maksimal 200 karakter.'),
  checksumSha256: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9a-fA-F]{64}$/.test(v), 'Checksum SHA-256 harus 64 karakter hex.'),
  releaseNotes: z.string().max(2000, 'Release Notes maksimal 2000 karakter.'),
});

export const faultResolutionSchema = z.object({
  note: z
    .string()
    .trim()
    .min(3, 'Resolution note minimal 3 karakter.')
    .max(500, 'Resolution note maksimal 500 karakter.'),
});

export const wanConnectionSchema = z
  .object({
    connectionType: z.enum(['PPPoE', 'IPoE', 'Bridge']),
    addressingMode: z.enum(['DHCP', 'Static']).optional().default('DHCP'),
    pppoeUsername: z.string().trim().max(128, 'PPPoE Username maksimal 128 karakter.'),
    pppoePassword: z.string().max(128, 'PPPoE Password maksimal 128 karakter.').optional().default(''),
    vlanEnabled: z.boolean().optional().default(true),
    vlanType: z.enum(['untag', 'transparent', 'tag']).optional(),
    vlanId: z
      .number()
      .int('VLAN ID harus bilangan bulat.')
      .min(0, 'VLAN ID harus antara 0–4094.')
      .max(4094, 'VLAN ID harus antara 0–4094.')
      .nullable(),
    wanIp: z.string().trim().optional().default(''),
    subnetMask: z.string().trim().optional().default(''),
    gateway: z.string().trim().optional().default(''),
    dns: z.string().trim().max(255, 'DNS maksimal 255 karakter.').optional().default(''),
    serviceList: z.string().trim().max(64, 'Service List maksimal 64 karakter.').optional().default(''),
    natEnabled: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    const effectiveVlanType = val.vlanType ?? (val.vlanEnabled ? 'tag' : 'untag');
    if (effectiveVlanType === 'tag' && (val.vlanId === null || val.vlanId < 1 || val.vlanId > 4094)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vlanId'], message: 'VLAN ID harus antara 1–4094 saat VLAN Type = Tag.' });
    }
    if (val.connectionType === 'IPoE' && val.addressingMode === 'Static') {
      if (!IPV4_REGEX.test(val.wanIp)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wanIp'], message: 'Static IPv4 address tidak valid.' });
      }
      if (!IPV4_REGEX.test(val.subnetMask)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subnetMask'], message: 'Subnet mask IPv4 tidak valid.' });
      }
      if (val.gateway && !IPV4_REGEX.test(val.gateway)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gateway'], message: 'Gateway IPv4 tidak valid.' });
      }
    }
    if (val.dns) {
      const dnsItems = val.dns.split(',').map((s) => s.trim()).filter(Boolean);
      for (const ip of dnsItems) {
        if (!IPV4_REGEX.test(ip)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dns'], message: `DNS IP tidak valid: ${ip}` });
          break;
        }
      }
    }
  });

export const dhcpServerSchema = z
  .object({
    lanIp: z.string().trim().regex(IPV4_REGEX, 'IP Address LAN harus IPv4 yang valid.'),
    lanSubnetMask: z.string().trim().regex(IPV4_REGEX, 'Subnet Mask LAN harus IPv4 yang valid.'),
    dhcpServerEnable: z.boolean(),
    option125Enable: z.boolean(),
    leaseTimeSeconds: z.number().int('Lease Time harus bilangan bulat.').min(60, 'Lease Time minimal 60 detik.'),
    startIp: z.string().trim().regex(IPV4_REGEX, 'Start DHCP IP harus IPv4 yang valid.'),
    endIp: z.string().trim().regex(IPV4_REGEX, 'End DHCP IP harus IPv4 yang valid.'),
    assignIspDns: z.boolean(),
    dns1: z.string().trim().optional().default(''),
    dns2: z.string().trim().optional().default(''),
    dns3: z.string().trim().optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (!val.assignIspDns) {
      for (const [key, ip] of [['dns1', val.dns1], ['dns2', val.dns2], ['dns3', val.dns3]] as const) {
        if (ip && !IPV4_REGEX.test(ip)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key.toUpperCase()} harus IPv4 yang valid.` });
        }
      }
    }
  });

export const wifiConfigSchema = z
  .object({
    enabled: z.boolean(),
    ssid: z.string().trim().min(1, 'SSID wajib diisi.').max(32, 'SSID maksimal 32 karakter.'),
    securityMode: z.string().trim().min(1, 'Security Mode wajib dipilih.'),
    band: z.enum(['2.4 GHz', '5 GHz']),
    channel: z.string().trim().min(1, 'Channel wajib dipilih.'),
    passphrase: z.string(),
    allowBlankPassphrase: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    const isUnencrypted = val.securityMode === 'None' || val.securityMode === 'Open';
    const skipUnchanged = val.allowBlankPassphrase && (val.passphrase === '' || /^•+$/.test(val.passphrase));
    if (!isUnencrypted && !skipUnchanged && (val.passphrase.length < 8 || val.passphrase.length > 63)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['passphrase'],
        message: 'WiFi Passphrase harus 8–63 karakter untuk mode terenkripsi.',
      });
    }
  });

export const deviceCredentialsSchema = z
  .object({
    adminPassword: z.string().max(128, 'Admin Password maksimal 128 karakter.'),
    userPassword: z.string().max(128, 'User Password maksimal 128 karakter.'),
    connectionRequestPassword: z.string().max(128, 'Connection Request Password maksimal 128 karakter.'),
  })
  .refine(
    (v) => Boolean(v.adminPassword.trim() || v.userPassword.trim() || v.connectionRequestPassword.trim()),
    'Isi minimal satu password sebelum menyimpan perubahan kredensial.',
  );

export const setParameterSchema = z.object({
  path: z
    .string()
    .trim()
    .min(3, 'Parameter path wajib diisi.')
    .max(512, 'Parameter path maksimal 512 karakter.')
    .refine(
      (p) => p.startsWith('InternetGatewayDevice.') || p.startsWith('Device.'),
      'Path harus diawali InternetGatewayDevice. atau Device.',
    ),
  value: z.string().max(2048, 'Parameter value maksimal 2048 karakter.'),
});

export const systemSettingsSchema = z
  .object({
    general: z.object({
      systemName: z.string().trim().min(2, 'System Name minimal 2 karakter.').max(64, 'System Name maksimal 64 karakter.'),
      timezone: z.string().trim().min(2, 'Timezone wajib diisi.').max(64, 'Timezone maksimal 64 karakter.'),
      dateFormat: z.string().trim().min(2).max(32),
      defaultPageSize: z.number().int().min(5, 'Default Page Size minimal 5.').max(200, 'Default Page Size maksimal 200.'),
      retentionDays: z.number().int().min(1, 'Retention Days minimal 1 hari.').max(3650, 'Retention Days maksimal 3650 hari.'),
    }),
    deviceStatus: z.object({
      onlineThresholdSeconds: z
        .number()
        .int()
        .min(30, 'Online Threshold minimal 30 detik.')
        .max(86400, 'Online Threshold maksimal 86400 detik.'),
      periodicInformExpectationSeconds: z
        .number()
        .int()
        .min(30, 'Expected Periodic Inform minimal 30 detik.')
        .max(86400, 'Expected Periodic Inform maksimal 86400 detik.'),
      neverConnectedPolicy: z.enum(['separate_bucket', 'treat_unknown']),
      recalculationIntervalSeconds: z.number().int().min(10).max(3600),
    }),
    classification: z.object({
      tempWarningC: z.number().min(-20).max(120),
      tempCriticalC: z.number().min(-20).max(150),
      rxStrongMinDbm: z.number().min(-60).max(10),
      rxGoodMinDbm: z.number().min(-60).max(10),
      rxAttentionMinDbm: z.number().min(-60).max(10),
      rxWeakMinDbm: z.number().min(-60).max(10),
    }),
    protocol: z.object({
      cwmpEndpoint: z
        .string()
        .trim()
        .url('CWMP Endpoint harus berupa URL valid (http:// atau https://).')
        .refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'CWMP Endpoint harus http:// atau https://.'),
      cwmpVersions: z.array(z.string()).min(1),
      sessionTimeoutSeconds: z
        .number()
        .int()
        .min(10, 'CWMP Session Timeout minimal 10 detik.')
        .max(600, 'CWMP Session Timeout maksimal 600 detik.'),
      connectionRequestTimeoutSeconds: z.number().int().min(1).max(120),
      uspControllerId: z.string().trim().min(2, 'USP Controller ID minimal 2 karakter.').max(128),
      uspMtp: z.enum(['mqtt', 'websocket', 'stomp', 'coap']),
      allowAutoEnrollment: z.boolean(),
    }),
    autoSummon: z.object({
      groups: z.array(
        z.enum([
          'optical_health',
          'wan_summary',
          'device_info',
          'device_health',
          'wan',
          'wifi',
          'connected_hosts',
          'credentials',
          'vparams',
          'parameters',
        ]),
      ),
      events: z.array(z.enum(['0 BOOTSTRAP', '1 BOOT', '4 VALUE CHANGE', '2 PERIODIC'])),
      periodicCooldownSeconds: z
        .number()
        .int()
        .min(10, 'Periodic Auto-Summon Cooldown minimal 10 detik.')
        .max(86400, 'Periodic Auto-Summon Cooldown maksimal 86400 detik.'),
      workerSyncMode: z.enum(['first_detect_only', 'realtime_loop', 'off']),
      workerCooldownSeconds: z
        .number()
        .int()
        .min(30, 'Worker Cooldown minimal 30 detik.')
        .max(86400, 'Worker Cooldown maksimal 86400 detik.'),
    }),
  })
  .superRefine((val, ctx) => {
    if (val.classification.tempWarningC >= val.classification.tempCriticalC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classification', 'tempWarningC'],
        message: 'Temperature Warning harus lebih kecil dari Critical Threshold.',
      });
    }
    const { rxStrongMinDbm, rxGoodMinDbm, rxAttentionMinDbm, rxWeakMinDbm } = val.classification;
    if (!(rxStrongMinDbm > rxGoodMinDbm && rxGoodMinDbm > rxAttentionMinDbm && rxAttentionMinDbm > rxWeakMinDbm)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classification', 'rxStrongMinDbm'],
        message: 'Threshold RX Power harus berurutan menurun: Sangat Kuat > Baik > Perlu Perhatian > Lemah.',
      });
    }
  });

export const manufacturerAliasSchema = z.object({
  rawName: z.string().trim().min(1, 'Raw Inform String wajib diisi.').max(255, 'Raw Inform String maksimal 255 karakter.'),
  canonicalName: z.string().trim().min(1, 'Canonical Name wajib diisi.').max(64, 'Canonical Name maksimal 64 karakter.'),
  oui: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) =>
        v === '' ||
        (v.length <= 64 &&
          v.split(',').every((tok) => /^[0-9A-F]{6}$/.test(tok.trim()))),
      'OUI harus 6 karakter hex (bisa dipisah koma, contoh: 00259E, 00E0FC).',
    ),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const simulateInformSchema = z.object({
  serial: z
    .string()
    .trim()
    .min(3, 'Serial Number minimal 3 karakter.')
    .max(64, 'Serial Number maksimal 64 karakter.')
    .regex(/^[A-Za-z0-9._-]+$/, 'Serial Number hanya boleh huruf, angka, titik, underscore, atau minus.'),
  manufacturer: z.string().trim().min(1, 'Manufacturer wajib dipilih.').max(64),
  model: z.string().trim().min(1, 'Model Name wajib diisi.').max(64),
  productClass: z.string().trim().max(64),
  technology: z.enum(['GPON', 'EPON', 'Router', 'N/A']),
});
