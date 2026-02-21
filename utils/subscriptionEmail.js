import { sendEmail } from './email.js';
import { PLANS, WHATSAPP_PACKS, calculateGST } from '../config/plans.js';

// ─── Subscription activated / upgraded ───────────────────────────────────────
const activatedTemplate = (company, plan, billingCycle, invoice) => {
  const planConfig = PLANS[plan];
  const isYearly = billingCycle === 'yearly';
  const periodLabel = isYearly ? 'year' : 'month';
  const endDate = invoice?.periodEnd
    ? new Date(invoice.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  return {
    subject: `🎉 ${planConfig.name} Plan Activated — TheParchi`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #FF6B6B, #6C5CE7); padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ${planConfig.name}! 🚀</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Your subscription is now active</p>
        </div>

        <p>Hi <strong>${company.name}</strong>,</p>
        <p>Your <strong>${planConfig.name} Plan</strong> (billed ${isYearly ? 'yearly' : 'monthly'}) is now active. Here's what you get:</p>

        <div style="background: #F7F8FC; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #6B7280;">Plan</td><td style="font-weight: 600;">${planConfig.name}</td></tr>
            <tr><td style="padding: 6px 0; color: #6B7280;">Billing</td><td style="font-weight: 600;">Every ${periodLabel}</td></tr>
            <tr><td style="padding: 6px 0; color: #6B7280;">Valid Until</td><td style="font-weight: 600;">${endDate}</td></tr>
            ${invoice ? `<tr><td style="padding: 6px 0; color: #6B7280;">Invoice</td><td style="font-weight: 600;">${invoice.invoiceNumber}</td></tr>` : ''}
            ${invoice ? `<tr><td style="padding: 6px 0; color: #6B7280;">Amount Paid</td><td style="font-weight: 600;">₹${invoice.totalAmount} (incl. 18% GST)</td></tr>` : ''}
          </table>
        </div>

        <p style="color: #6B7280; font-size: 14px;">You can view your invoice and manage your subscription from Settings → Billing inside TheParchi.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.FRONTEND_URL}/settings" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Go to Dashboard</a>
        </div>

        <p style="color: #9CA3AF; font-size: 12px;">If you have any questions, reply to this email or contact support.</p>
      </div>
    `,
  };
};

// ─── Grace period started ─────────────────────────────────────────────────────
const gracePeriodTemplate = (company, graceEndDate) => ({
  subject: `⚠️ Your TheParchi subscription has expired — 7 days to renew`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: #FDCB6E; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1A1D2E; margin: 0; font-size: 22px;">⚠️ Subscription Expired</h1>
        <p style="color: #1A1D2E; margin: 8px 0 0;">You have 7 days to renew before your account is downgraded</p>
      </div>

      <p>Hi <strong>${company.name}</strong>,</p>
      <p>Your <strong>${PLANS[company.subscription?.plan]?.name || 'paid'} plan</strong> has expired. You are now in a <strong>7-day grace period</strong>.</p>

      <div style="background: #FFF3CD; border-left: 4px solid #FDCB6E; padding: 16px; border-radius: 4px; margin: 16px 0;">
        <p style="margin: 0;"><strong>During grace period:</strong> You can still view all your data but cannot create new challans or use premium features.</p>
        <p style="margin: 8px 0 0;"><strong>Grace period ends:</strong> ${new Date(graceEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <p>After the grace period, your account will be downgraded to the Free plan.</p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.FRONTEND_URL}/settings/billing" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Renew Now</a>
      </div>
    </div>
  `,
});

// ─── Renewal reminder (3 days before) ────────────────────────────────────────
const renewalReminderTemplate = (company) => ({
  subject: `📅 Your TheParchi subscription renews in 3 days`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <p>Hi <strong>${company.name}</strong>,</p>
      <p>This is a reminder that your <strong>${PLANS[company.subscription?.plan]?.name} plan</strong> renews in <strong>3 days</strong> on ${new Date(company.subscription?.nextBillingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      <p>Make sure your payment method is up to date to avoid any interruption.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.FRONTEND_URL}/settings/billing" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Manage Billing</a>
      </div>
    </div>
  `,
});

// ─── Suspended ────────────────────────────────────────────────────────────────
const suspendedTemplate = (company) => ({
  subject: `❌ Your TheParchi account has been downgraded to Free`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: #FFE0E0; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
        <h1 style="color: #E55555; margin: 0; font-size: 22px;">Account Downgraded</h1>
      </div>
      <p>Hi <strong>${company.name}</strong>,</p>
      <p>Your grace period has ended and your account has been moved to the <strong>Free plan</strong>. Your data is safe — you can still access everything in read-only mode.</p>
      <p>To restore full access, upgrade your plan anytime.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.FRONTEND_URL}/settings/billing" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Upgrade Plan</a>
      </div>
    </div>
  `,
});

// ─── WhatsApp credits purchased ───────────────────────────────────────────────
const whatsappCreditsTemplate = (company, credits, invoice) => ({
  subject: `✅ ${credits} WhatsApp credits added — TheParchi`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <p>Hi <strong>${company.name}</strong>,</p>
      <p><strong>${credits} WhatsApp credits</strong> have been added to your account.</p>
      <div style="background: #F7F8FC; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          ${invoice ? `<tr><td style="padding: 6px 0; color: #6B7280;">Invoice</td><td style="font-weight: 600;">${invoice.invoiceNumber}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #6B7280;">Credits Added</td><td style="font-weight: 600;">${credits}</td></tr>
          ${invoice ? `<tr><td style="padding: 6px 0; color: #6B7280;">Amount Paid</td><td style="font-weight: 600;">₹${invoice.totalAmount} (incl. 18% GST)</td></tr>` : ''}
        </table>
      </div>
    </div>
  `,
});

// ─── Main export ──────────────────────────────────────────────────────────────
export const sendSubscriptionEmail = async (company, plan, billingCycle, invoice, eventType = 'activated') => {
  if (!company?.email) return;

  let template;
  switch (eventType) {
    case 'activated':
    case 'upgraded':
      template = activatedTemplate(company, plan, billingCycle, invoice);
      break;
    case 'grace_period':
      template = gracePeriodTemplate(company, company.subscription?.graceEndDate);
      break;
    case 'renewal_reminder':
      template = renewalReminderTemplate(company);
      break;
    case 'suspended':
      template = suspendedTemplate(company);
      break;
    case 'whatsapp_credits':
      template = whatsappCreditsTemplate(company, invoice?.whatsappCredits, invoice);
      break;
    default:
      template = activatedTemplate(company, plan, billingCycle, invoice);
  }

  await sendEmail({
    to: company.email,
    subject: template.subject,
    html: template.html,
  });
};
