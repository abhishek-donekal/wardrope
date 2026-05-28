import { User } from "@/src/contexts/AuthContext";

export const DEMO_USER: User = {
  user_id: "demo-user",
  email: "demo@wardrope.app",
  name: "Alex Demo",
  picture: null,
  dob: "1995-01-15",
  gender: "Female",
  style_preferences: ["Evening events", "Casual weekends", "Date nights"],
  lifestyle: "Classic",
  fidelity_mode: "descriptive",
  onboarding_complete: true,
  auth_provider: "email",
  email_verified: true,
  phone: null,
  phone_verified: false,
  points: 350,
  stylist_persona: "editor",
  plan_type: "free",
  plan_period: "monthly",
  plan_addons: [],
  subscription_status: "none",
};

export const DEMO_ITEMS = [
  {
    item_id: "demo-item-1",
    user_id: "demo-user",
    name: "White Button-Down Shirt",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=400",
    tags: { type: "Top", category: "Tops", color: "White", pattern: "Solid", material: "Cotton", season: ["Spring", "Summer"], occasion: ["Work", "Casual"], formality: "Smart casual", description: "Classic white button-down, versatile and timeless." },
    fidelity_mode: "descriptive", brand: "Zara", favorite: false, listing_status: null,
    times_worn: 12, last_worn_at: "2026-05-20T10:00:00Z", price: 45.99, purchased_at: "2025-03-01",
    created_at: "2025-03-01T00:00:00Z"
  },
  {
    item_id: "demo-item-2",
    user_id: "demo-user",
    name: "Black Slim Trousers",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1594938298603-c8148c4b4d6a?w=400",
    tags: { type: "Bottom", category: "Bottoms", color: "Black", pattern: "Solid", material: "Wool blend", season: ["Fall", "Winter", "Spring"], occasion: ["Work", "Formal"], formality: "Formal", description: "Sleek black trousers with a slim fit." },
    fidelity_mode: "descriptive", brand: "H&M", favorite: true, listing_status: null,
    times_worn: 20, last_worn_at: "2026-05-25T09:00:00Z", price: 59.99, purchased_at: "2025-01-15",
    created_at: "2025-01-15T00:00:00Z"
  },
  {
    item_id: "demo-item-3",
    user_id: "demo-user",
    name: "Navy Blazer",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400",
    tags: { type: "Jacket", category: "Outerwear", color: "Navy", pattern: "Solid", material: "Polyester blend", season: ["Fall", "Spring"], occasion: ["Work", "Formal", "Date nights"], formality: "Smart casual", description: "Structured navy blazer that elevates any look." },
    fidelity_mode: "descriptive", brand: "Massimo Dutti", favorite: true, listing_status: null,
    times_worn: 8, last_worn_at: "2026-05-22T18:00:00Z", price: 129.99, purchased_at: "2024-09-10",
    created_at: "2024-09-10T00:00:00Z"
  },
  {
    item_id: "demo-item-4",
    user_id: "demo-user",
    name: "Silk Midi Dress",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400",
    tags: { type: "Dress", category: "Dresses", color: "Champagne", pattern: "Solid", material: "Silk", season: ["Summer", "Spring"], occasion: ["Evening events", "Date nights", "Formal"], formality: "Formal", description: "Elegant silk midi dress with a fluid silhouette." },
    fidelity_mode: "descriptive", brand: "& Other Stories", favorite: true, listing_status: null,
    times_worn: 4, last_worn_at: "2026-04-15T20:00:00Z", price: 175.00, purchased_at: "2024-12-01",
    created_at: "2024-12-01T00:00:00Z"
  },
  {
    item_id: "demo-item-5",
    user_id: "demo-user",
    name: "White Sneakers",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
    tags: { type: "Shoes", category: "Shoes", color: "White", pattern: "Solid", material: "Leather", season: ["Spring", "Summer", "Fall"], occasion: ["Casual weekends", "Casual"], formality: "Casual", description: "Clean white leather sneakers, a wardrobe staple." },
    fidelity_mode: "descriptive", brand: "Common Projects", favorite: false, listing_status: null,
    times_worn: 35, last_worn_at: "2026-05-27T14:00:00Z", price: 199.00, purchased_at: "2024-06-01",
    created_at: "2024-06-01T00:00:00Z"
  },
  {
    item_id: "demo-item-6",
    user_id: "demo-user",
    name: "Camel Coat",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400",
    tags: { type: "Jacket", category: "Outerwear", color: "Camel", pattern: "Solid", material: "Wool", season: ["Fall", "Winter"], occasion: ["Casual weekends", "Work"], formality: "Smart casual", description: "Classic camel wool coat, the ultimate cold-weather staple." },
    fidelity_mode: "descriptive", brand: "Sandro", favorite: false, listing_status: null,
    times_worn: 18, last_worn_at: "2026-02-10T12:00:00Z", price: 420.00, purchased_at: "2024-10-15",
    created_at: "2024-10-15T00:00:00Z"
  },
  {
    item_id: "demo-item-7",
    user_id: "demo-user",
    name: "Black Crossbody Bag",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400",
    tags: { type: "Bag", category: "Accessories", color: "Black", pattern: "Solid", material: "Leather", season: ["All seasons"], occasion: ["Casual weekends", "Work", "Evening events"], formality: "Versatile", description: "Compact black leather crossbody with gold hardware." },
    fidelity_mode: "descriptive", brand: "Mango", favorite: false, listing_status: null,
    times_worn: 42, last_worn_at: "2026-05-28T10:00:00Z", price: 89.99, purchased_at: "2024-04-01",
    created_at: "2024-04-01T00:00:00Z"
  },
  {
    item_id: "demo-item-8",
    user_id: "demo-user",
    name: "Blue Denim Jeans",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
    tags: { type: "Bottom", category: "Bottoms", color: "Blue", pattern: "Solid", material: "Denim", season: ["All seasons"], occasion: ["Casual weekends", "Casual"], formality: "Casual", description: "Classic mid-rise straight-leg denim in a timeless blue wash." },
    fidelity_mode: "descriptive", brand: "Levi's", favorite: false, listing_status: null,
    times_worn: 28, last_worn_at: "2026-05-26T16:00:00Z", price: 98.00, purchased_at: "2025-02-01",
    created_at: "2025-02-01T00:00:00Z"
  },
  {
    item_id: "demo-item-9",
    user_id: "demo-user",
    name: "Black Ankle Boots",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400",
    tags: { type: "Shoes", category: "Shoes", color: "Black", pattern: "Solid", material: "Leather", season: ["Fall", "Winter", "Spring"], occasion: ["Work", "Casual weekends", "Date nights"], formality: "Smart casual", description: "Sleek black leather ankle boots with a low block heel." },
    fidelity_mode: "descriptive", brand: "COS", favorite: true, listing_status: null,
    times_worn: 15, last_worn_at: "2026-05-15T09:00:00Z", price: 159.00, purchased_at: "2024-11-01",
    created_at: "2024-11-01T00:00:00Z"
  },
  {
    item_id: "demo-item-10",
    user_id: "demo-user",
    name: "Striped Breton Top",
    image_base64: "",
    image_url: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=400",
    tags: { type: "Top", category: "Tops", color: "Navy/White", pattern: "Stripes", material: "Cotton", season: ["Spring", "Summer"], occasion: ["Casual weekends", "Casual"], formality: "Casual", description: "Classic Breton striped top in navy and white." },
    fidelity_mode: "descriptive", brand: "Saint James", favorite: false, listing_status: null,
    times_worn: 9, last_worn_at: "2026-05-18T11:00:00Z", price: 65.00, purchased_at: "2025-04-10",
    created_at: "2025-04-10T00:00:00Z"
  },
];

export const DEMO_CLOSET = {
  closet_id: "demo-closet",
  user_id: "demo-user",
  name: "My Wardrobe",
  is_default: true,
  item_count: 10,
  created_at: "2025-01-01T00:00:00Z",
};

export const DEMO_OUTFITS = [
  {
    outfit_id: "demo-outfit-1",
    user_id: "demo-user",
    title: "Smart Casual Office Look",
    description: "A polished yet comfortable look for the office.",
    item_ids: ["demo-item-1", "demo-item-2", "demo-item-3"],
    occasion: "Work",
    favorite: true,
    rating: 5,
    created_at: "2026-04-01T00:00:00Z",
  },
  {
    outfit_id: "demo-outfit-2",
    user_id: "demo-user",
    title: "Weekend Brunch Vibes",
    description: "Relaxed but put-together for a casual weekend.",
    item_ids: ["demo-item-10", "demo-item-8", "demo-item-5"],
    occasion: "Casual weekends",
    favorite: false,
    rating: 4,
    created_at: "2026-04-15T00:00:00Z",
  },
  {
    outfit_id: "demo-outfit-3",
    user_id: "demo-user",
    title: "Evening Elegance",
    description: "Effortlessly chic for dinner or an event.",
    item_ids: ["demo-item-4", "demo-item-9", "demo-item-7"],
    occasion: "Evening events",
    favorite: true,
    rating: 5,
    created_at: "2026-05-01T00:00:00Z",
  },
];
