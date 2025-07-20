-- Sample subscription plans for testing
-- Note: You'll need to create these products and prices in your Stripe dashboard first
-- and replace the stripe_price_id and stripe_product_id with actual values

INSERT INTO subscription_plans (
  name, 
  description, 
  price, 
  interval, 
  features, 
  stripe_price_id, 
  stripe_product_id, 
  is_active, 
  sort_order
) VALUES 
(
  'Free',
  'Perfect for getting started with basic AI assistance',
  '0.00',
  'month',
  '["Basic chat access", "Limited AI interactions (10/month)", "Community support", "Basic code suggestions"]',
  'price_free', -- Replace with actual Stripe price ID
  'prod_free',  -- Replace with actual Stripe product ID
  true,
  1
),
(
  'NomadAI Pro',
  'Complete AI development assistant - Everything you need for just $5/month',
  '5.00',
  'month',
  '["Unlimited AI interactions", "Advanced code analysis", "UI generation & cloning", "Performance insights", "Design pattern analysis", "Email support", "Priority processing", "All AI models available", "Code improvement suggestions", "Advanced debugging assistance"]',
  'price_pro_monthly', -- Replace with actual Stripe price ID
  'prod_pro',          -- Replace with actual Stripe product ID
  true,
  2
),
(
  'Enterprise',
  'Advanced features for teams and organizations',
  '25.00',
  'month',
  '["Everything in NomadAI Pro", "Team collaboration tools", "Advanced analytics", "Custom integrations", "Priority support", "SLA guarantee", "Team management", "Custom model training", "Dedicated account manager"]',
  'price_enterprise_monthly', -- Replace with actual Stripe price ID
  'prod_enterprise',          -- Replace with actual Stripe product ID
  true,
  3
);

-- Optional: Annual plans with discount
INSERT INTO subscription_plans (
  name, 
  description, 
  price, 
  interval, 
  features, 
  stripe_price_id, 
  stripe_product_id, 
  is_active, 
  sort_order
) VALUES 
(
  'NomadAI Pro Annual',
  'Save $12/year with annual billing - Just $4.17/month!',
  '50.00',
  'year',
  '["Everything in NomadAI Pro", "2 months free with annual billing", "$12 annual savings", "Annual billing"]',
  'price_pro_yearly', -- Replace with actual Stripe price ID
  'prod_pro',         -- Same product, different price
  true,
  4
),
(
  'Enterprise Annual',
  'Best value for growing teams - Save $60/year',
  '240.00',
  'year',
  '["Everything in Enterprise monthly", "2 months free with annual billing", "$60 annual savings", "Annual billing"]',
  'price_enterprise_yearly', -- Replace with actual Stripe price ID
  'prod_enterprise',         -- Same product, different price
  true,
  5
); 