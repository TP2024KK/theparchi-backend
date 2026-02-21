import { Resend } from 'resend';
import { PLANS } from '../config/plans.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'TheParchi <noreply@theparchi.com>';

const send = async (to, subject, html) => {
  await resend.emails.send({ from: FROM, to, subject, html });
};

const activatedHtml = (company, plan, billingCycle, invoice) => {
  const planConfig = PLANS[plan];
  const isYearly = billingCycle === 'yearly';
  const endDate = invoice?.periodEnd
    ? new Date(invoice.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#FF6B6B,#6C5CE7);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
        <h1 style="color:white;margin:0;font-size:24px;">Welcome to ${planConfig.name}! 🚀</h1>
      </div>
      <p>Hi <strong>${company.name}</strong>,</p>
      <p>Your <strong>${planConfig.name} Plan</strong> (billed ${isYearly ? 'yearly' : 'monthly'}) is now active.</p>
      <div style="background:#F7F8FC;border-radius:8px;padding:16px;margin:16px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#6B7280;">Plan</td><td style="font-weight:600;">${planConfig.name}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Billing</td><td style="font-weight:600;">Every ${isYearly ? 'year' : 'month'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280;">Valid Until</td><td style="font-weight:600;">${endDate}</td></tr>
          ${invoice ? `<tr><td style="padding:6px 0;color:#6B7280;">Invoice</td><td style="font-weight:600;">${invoice.invoiceNumber}</td></tr>` : ''}
          ${invoice ? `<tr><td style="padding:6px 0;color:#6B7280;">Amount Paid</td><td style="font-weight:600;">&#8377;${invoice.totalAmount} (incl. 18% GST)</td></tr>` : ''}
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.FRONTEND_URL}/settings" style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Go to Dashboard</a>
      </div>
    </div>`;
};

const gracePeriodHtml = (company) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#FDCB6E;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#1A1D2E;margin:0;font-size:22px;">Subscription Expired</h1>
      <p style="color:#1A1D2E;margin:8px 0 0;">You have 7 days to renew before your account is downgraded</p>
    </div>
    <p>Hi <strong>${company.name}</strong>,</p>
    <p>Your subscription has expired. You are now in a <strong>7-day grace period</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL}/billing" style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Renew Now</a>
    </div>
  </div>`;

const renewalReminderHtml = (company) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <p>Hi <strong>${company.name}</strong>,</p>
    <p>Your <strong>${PLANS[company.subscription?.plan]?.name} plan</strong> renews in <strong>3 days</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL}/billing" style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Manage Billing</a>
    </div>
  </div>`;

const suspendedHtml = (company) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#FFE0E0;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#E55555;margin:0;font-size:22px;">Account Downgraded to Free</h1>
    </div>
    <p>Hi <strong>${company.name}</strong>,</p>
    <p>Your grace period has ended. Your account is now on the Free plan. Your data is safe.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL}/billing" style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Upgrade Plan</a>
    </div>
  </div>`;

const whatsappCreditsHtml = (company, credits, invoice) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <p>Hi <strong>${company.name}</strong>,</p>
    <p><strong>${credits} WhatsApp credits</strong> have been added to your account.</p>
    <div style="background:#F7F8FC;border-radius:8px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${invoice ? `<tr><td style="padding:6px 0;color:#6B7280;">Invoice</td><td style="font-weight:600;">${invoice.invoiceNumber}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#6B7280;">Credits Added</td><td style="font-weight:600;">${credits}</td></tr>
        ${invoice ? `<tr><td style="padding:6px 0;color:#6B7280;">Amount Paid</td><td style="font-weight:600;">&#8377;${invoice.totalAmount} (incl. 18% GST)</td></tr>` : ''}
      </table>
    </div>
  </div>`;

export const sendSubscriptionEmail = async (company, plan, billingCycle, invoice, eventType = 'activated') => {
  if (!company?.email) return;
  try {
    switch (eventType) {
      case 'activated':
      case 'upgraded':
        await send(company.email, `${PLANS[plan]?.name} Plan Activated — TheParchi`, activatedHtml(company, plan, billingCycle, invoice));
        break;
      case 'grace_period':
        await send(company.email, `Your TheParchi subscription has expired — 7 days to renew`, gracePeriodHtml(company));
        break;
      case 'renewal_reminder':
        await send(company.email, `Your TheParchi subscription renews in 3 days`, renewalReminderHtml(company));
        break;
      case 'suspended':
        await send(company.email, `Your TheParchi account has been downgraded to Free`, suspendedHtml(company));
        break;
      case 'whatsapp_credits':
        await send(company.email, `${invoice?.whatsappCredits} WhatsApp credits added — TheParchi`, whatsappCreditsHtml(company, invoice?.whatsappCredits, invoice));
        break;
    }
  } catch (err) {
    console.error('[subscriptionEmail] Failed:', err.message);
  }
};
