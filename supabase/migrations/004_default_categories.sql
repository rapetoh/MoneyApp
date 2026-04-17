-- Default categories managed by the app owner in Supabase dashboard.
-- When a new user signs up, their categories are seeded from this table.
-- To add/change a default: edit this table directly in Supabase dashboard — no rebuild needed.

CREATE TABLE IF NOT EXISTS default_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL,
  icon       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- All authenticated users can read defaults (needed at sign-up time).
ALTER TABLE default_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read default categories"
  ON default_categories FOR SELECT
  TO authenticated
  USING (true);

-- Seed the initial defaults.
-- These cover the full range of everyday personal spending.
-- Edit from Supabase dashboard to add/rename/reorder — no code change needed.
INSERT INTO default_categories (name, color, icon, sort_order) VALUES
  ('Groceries',           '#4CAF50', '🛒', 1),   -- supermarkets, food stores, Walmart food
  ('Food & Dining',       '#FF6B35', '🍕', 2),   -- restaurants, cafes, takeout, delivery
  ('Transport',           '#4A90E2', '🚗', 3),   -- gas, Uber, bus, subway, parking
  ('Shopping',            '#9B59B6', '🛍️', 4),  -- retail, clothing, Amazon, electronics
  ('Entertainment',       '#E74C3C', '🎬', 5),   -- movies, concerts, games, hobbies, sports
  ('Health & Medical',    '#27AE60', '💊', 6),   -- doctor, dentist, pharmacy, lab tests
  ('Housing',             '#8B6914', '🏠', 7),   -- rent, mortgage, home maintenance, furniture
  ('Utilities',           '#607D8B', '💡', 8),   -- electricity, water, internet, phone, gas bill
  ('Subscriptions',       '#F39C12', '📱', 9),   -- Netflix, Spotify, gym, software, magazines
  ('Travel',              '#1ABC9C', '✈️', 10),  -- flights, hotels, Airbnb, vacation
  ('Personal Care',       '#E91E8C', '💆', 11),  -- haircut, beauty, spa, toiletries
  ('Education',           '#2C3E50', '📚', 12),  -- tuition, books, courses, school supplies
  ('Gifts & Donations',   '#E67E22', '🎁', 13),  -- presents, charity, tips
  ('Pets',                '#795548', '🐾', 14),  -- vet, pet food, grooming, supplies
  ('Insurance',           '#546E7A', '🛡️', 15), -- auto, health, life, renters insurance
  ('Kids & Family',       '#FF9800', '👶', 16),  -- childcare, school fees, toys, baby items
  ('Business & Work',     '#37474F', '💼', 17),  -- professional expenses, office supplies, tools
  ('Savings & Investing', '#00897B', '💰', 18),  -- savings transfers, investment contributions
  ('Fees & Charges',      '#757575', '🏦', 19),  -- bank fees, late fees, ATM fees, taxes
  ('Other',               '#95A5A6', '📦', 20);  -- catch-all for anything that doesn't fit above
