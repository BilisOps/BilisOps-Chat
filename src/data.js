// Static app config: platforms, rail navigation, plans, follow-up stages.

export const platformMeta = {
  shopee: { dot: 'dot-shopee', icon: '🛒', label: 'Shopee' },
  lazada: { dot: 'dot-lazada', icon: '📦', label: 'Lazada' },
  tiktok: { dot: 'dot-tiktok', icon: '🎵', label: 'TikTok' },
  fb:     { dot: 'dot-fb', icon: '👤', label: 'Facebook' },
};

export const PLATFORM_TABS = ['Shopee', 'Lazada', 'TikTok', 'Facebook'];

export const INTEGRATIONS = [
  { key: 'shopee', icon: '🛒', name: 'Shopee' },
  { key: 'lazada', icon: '📦', name: 'Lazada' },
  { key: 'tiktok', icon: '🎵', name: 'TikTok Shop' },
  { key: 'fb', icon: '👤', name: 'Facebook / Instagram' },
];

export const PLATFORM_SERVER_KEYS = { Shopee: 'shopee', Lazada: 'lazada', TikTok: 'tiktok', Facebook: 'fb' };

export const RAIL_TOP = [
  { id: 'home', icon: 'ti-home', title: 'Home', page: 'home' },
  { id: 'chats', icon: 'ti-message-circle', title: 'Chats', page: 'chats', badge: true },
  { id: 'tickets', icon: 'ti-ticket', title: 'Ticket Center', page: 'tickets' },
  { id: 'ai', icon: 'ti-robot', title: 'AI', menu: [
    { label: 'Data', items: [['ai-monitor', 'AI Chatbot Monitor'], ['ai-reception', 'Auto Reception']] },
    { label: 'Rules', items: [['ai-hub', 'AI Chatbot'], ['ai-recs', 'Product Recommendations'], ['ai-handover', 'Human Handover Rules'], ['ai-replyrules', 'AI Reply Rules']] },
  ]},
  { id: 'marketing', icon: 'ti-gift', title: 'Marketing', menu: [
    { label: 'Follow-up', items: [['followup', 'Order Follow-Up']] },
    { label: 'Marketing tools', items: [['broadcast', 'Message Broadcast']] },
    { label: 'Auto rules', items: [['quickreply', 'Quick Reply'], ['autoreply', 'Auto Reply'], ['replyreview', 'Reply Review'], ['reminders', 'Important Reminders']] },
  ]},
  { id: 'analytics', icon: 'ti-chart-bar', title: 'Analytics', menu: [
    { label: 'Performance', items: [['salesconv', 'Sales Conversion'], ['productloss', 'Product Loss'], ['orderloss', 'Order Loss'], ['reviewanalysis', 'Review Analysis']] },
    { label: 'Manage data', items: [['csperf', 'Agent Performance'], ['storeperf', 'Store Performance'], ['storehealth', 'Store Health']] },
  ]},
];

export const RAIL_BOTTOM = [
  { id: 'settings', icon: 'ti-settings', title: 'Settings', menu: [
    { label: 'Settings & service', items: [
      ['storeauth', 'Store Authorization'], ['csmanage', 'Agent Management'],
      ['reception', 'Chat Reception Settings'], ['sensitive', 'Sensitive Words'],
      ['system', 'System Settings'], ['oprecord', 'Operating Record'],
      ['plans', 'Plans & Billing'], ['privacy', 'Privacy Policy'],
    ]},
  ]},
  { id: 'account', icon: 'ti-user', title: 'Account', account: true },
];

export const PLANS = [
  { name: 'Free', seats: '1 seat', price: '₱0', per: 'forever', features: ['5 connected stores', '200 quick replies', '50 auto-replies per day', 'Basic analytics'] },
  { name: 'Starter', seats: '3 seats', price: '₱800', per: '/month', features: ['20 connected stores', '4,000 quick replies', 'Unlimited AI translation', 'Message broadcast (5/mo)'] },
  { name: 'Growth', seats: '7 seats', price: '₱2,490', per: '/month', recommended: true, features: ['50 connected stores', '8,000 quick replies', 'Message broadcast (10/mo)', 'Full data dashboard'] },
  { name: 'Pro', seats: '15 seats', price: '₱3,990', per: '/month', features: ['100 connected stores', '20,000 quick replies', 'Unlimited broadcasts', 'Priority chat support'] },
  { name: 'Scale', seats: '30 seats', price: '₱6,490', per: '/month', features: ['200 connected stores', 'Unlimited everything', '1-on-1 operations expert', 'Custom onboarding'] },
];

export const SEAT_LIMITS = { Free: 1, Starter: 3, Growth: 7, Pro: 15, Scale: 30 };

export const COMPARE_ROWS = [
  { cat: 'Workspace' },
  { label: 'Team seats', vals: ['1', '3', '7', '15', '30'] },
  { label: 'Connected stores', vals: ['5', '20', '50', '100', '200'] },
  { label: 'Review management', vals: [true, true, true, true, true] },
  { label: 'Refund & cancellation handling', vals: [true, true, true, true, true] },
  { cat: 'AI Tools' },
  { label: 'AI translation', vals: ['500/mo', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'AI Assist add-on eligible', vals: [false, true, true, true, true] },
  { cat: 'Messaging' },
  { label: 'Quick reply templates', vals: ['200', '4,000', '8,000', '20,000', 'Unlimited'] },
  { label: 'Auto-replies per day', vals: ['50', '500', '1,000', 'Unlimited', 'Unlimited'] },
  { label: 'Message broadcast', vals: [false, '5/mo', '10/mo', 'Unlimited', 'Unlimited'] },
  { label: 'Order follow-up flows', vals: ['2 steps', 'All steps', 'All steps', 'All steps', 'All steps'] },
  { label: 'Tag management', vals: [true, true, true, true, true] },
  { cat: 'Data' },
  { label: 'Performance analytics', vals: [true, true, true, true, true] },
  { label: 'Full data dashboard', vals: [false, false, true, true, true] },
  { label: 'Store performance compare', vals: [false, true, true, true, true] },
  { cat: 'Support' },
  { label: 'Chat support', vals: [true, true, true, true, true] },
  { label: '1-on-1 operations expert', vals: [false, false, false, false, true] },
];

export const FLOW_STAGES = [
  { icon: '💬', title: 'Buyer inquires', sub: 'Great first impressions', fns: ['Incoming buyer reception'] },
  { icon: '➕', title: 'Grow followers', sub: 'Turn buyers into followers', fns: ['Auto invite to follow', 'Follow reward'] },
  { icon: '💳', title: 'Guide payment', sub: 'Fewer unpaid checkouts', fns: ['Order reminder', 'Payment reminder'] },
  { icon: '🔄', title: 'Recover orders', sub: 'Win back cancellations', fns: ['Cancel-order reminder', 'Abandoned order recovery'] },
  { icon: '🚚', title: 'Logistics care', sub: 'Keep buyers informed', fns: ['Order confirmation', 'Shipping update', 'Out-for-delivery notice', 'Delivered confirmation'] },
  { icon: '⭐', title: 'Earn great reviews', sub: 'More 5-star ratings', fns: ['Review reminder', 'Review reward'] },
  { icon: '💰', title: 'Profit, secured', sub: 'The whole chain working', fns: [] },
];

export const BROADCAST_QUOTA = {
  Free: 'Broadcasts are a paid feature — upgrade to send.',
  Starter: '5 broadcasts/month on your plan.',
  Growth: '10 broadcasts/month on your plan.',
  Pro: 'Unlimited broadcasts on your plan.',
  Scale: 'Unlimited broadcasts on your plan.',
};
