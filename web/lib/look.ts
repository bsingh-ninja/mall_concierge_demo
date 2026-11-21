import {
  Baby, BookOpen, Coffee, Dumbbell, FerrisWheel, Film, Footprints, Gem, Gift, Glasses, Home, Laptop, type LucideIcon,
  PawPrint, Pill, Shirt, ShoppingBag, ShoppingCart, Sparkles, Store, ToyBrick, Utensils,
} from "lucide-react";

// Category identity on the map: a group name, an icon and a fallback photo.
type Look = { group: string; icon: LucideIcon; img: string };
const L = (group: string, icon: LucideIcon, img: string): Look => ({ group, icon, img });

const CATEGORY: Record<string, Look> = {
  restaurant: L("Dining", Utensils, "grill"),
  cafe: L("Dining", Coffee, "coffee"),
  grocery: L("Dining", ShoppingCart, "grocery"),
  fashion: L("Apparel", Shirt, "fashion"),
  department: L("Apparel", ShoppingBag, "fashion"),
  footwear: L("Footwear", Footprints, "sneakers"),
  jewellery: L("Apparel", Gem, "jewellery"),
  eyewear: L("Apparel", Glasses, "eyewear"),
  kids: L("Kids & toys", Baby, "kids"),
  toys: L("Kids & toys", ToyBrick, "toys"),
  play: L("Kids & toys", FerrisWheel, "play"),
  electronics: L("Electronics", Laptop, "electronics"),
  sports: L("Sports", Dumbbell, "sports"),
  beauty: L("Beauty & health", Sparkles, "beauty"),
  pharmacy: L("Beauty & health", Pill, "beauty"),
  pets: L("Home & gifts", PawPrint, "home"),
  home: L("Home & gifts", Home, "home"),
  gifts: L("Home & gifts", Gift, "gifts"),
  books: L("Home & gifts", BookOpen, "books"),
  cinema: L("Leisure", Film, "cinema"),
};
const FALLBACK = L("Services", Store, "mall");

export const look = (category: string) => CATEGORY[category] ?? FALLBACK;
export const group = (category: string) => look(category).group;

// Stores whose photo should be more specific than their category's.
const STORE_IMG: Record<string, string> = {
  "saffron-house": "indian", "olive--ember": "grill", "burger-barn": "burger", "pizza-piazza": "pizza", "sushi-wave": "sushi",
  "noodle-theory": "noodles", "shawarma-street": "shawarma", "gelato-lab": "gelato", "sweet-tooth": "gelato",
  "stride-athletics": "sneakers", "kicks-lab": "sneakers", "urban-sole": "sneakers", "sporty-kids": "sneakers",
};
export const photo = (storeId: string, category: string) => `/img/${STORE_IMG[storeId] ?? look(category).img}.jpg`;
