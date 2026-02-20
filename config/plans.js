export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: { maxUsers: 1, maxChallansPerMonth: 25, maxStorageMB: 100 },
    features: ['Basic challan management']
  },
  starter: {
    name: 'Starter',
    price: 499,
    limits: { maxUsers: 3, maxChallansPerMonth: 500, maxStorageMB: 1024 },
    features: ['Export', 'Email notifications', 'PDF customization']
  },
  growth: {
    name: 'Growth',
    price: 1999,
    limits: { maxUsers: 10, maxChallansPerMonth: -1, maxStorageMB: 10240 },
    features: ['Inventory', 'Teams', 'WhatsApp', 'Priority support']
  },
  enterprise: {
    name: 'Enterprise',
    price: null,
    limits: { maxUsers: -1, maxChallansPerMonth: -1, maxStorageMB: 102400 },
    features: ['White-label', 'Custom domain', 'Dedicated support', 'SLA']
  }
};
