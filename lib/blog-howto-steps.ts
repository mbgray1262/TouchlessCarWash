/**
 * Auto-generated HowTo step data for the instructional blog posts.
 *
 * Regenerate with: `node scripts/generate-blog-howto-steps.mjs`
 * Powers the HowTo JSON-LD emitted on each listed post.
 */
export type HowToStepData = { name: string; text: string };

export type HowToPostData = {
  name: string;
  description: string;
  steps: HowToStepData[];
};

export const BLOG_HOWTO_STEPS: Record<string, HowToPostData> = {
  "how-to-remove-water-spots-after-car-wash": {
    name: "How to Remove Water Spots After a Car Wash",
    description: "Learn to identify and remove mineral deposits and water spots from your car's paint and glass using household or automotive products.",
    steps: [
      { name: "Try white vinegar solution first", text: "Mix equal parts white vinegar and distilled water in a spray bottle. Spray on the affected area, let it sit for 60 seconds, then wipe with a clean microfiber cloth." },
      { name: "Use a detailing clay bar for stubborn spots", text: "Lubricate the spotted area with clay bar spray, then gently glide the clay bar back and forth. The clay will physically pull mineral deposits off the paint surface." },
      { name: "Apply polishing compound for bonded deposits", text: "Apply a light polishing compound with a microfiber applicator pad. Work in small sections using circular motions to remove bonded mineral deposits along with a microscopic layer of clear coat." },
      { name: "Use dedicated water spot remover for heavy spotting", text: "Apply a specialized water spot remover product according to manufacturer instructions. Most involve spraying on the affected area, waiting, and wiping off with a microfiber cloth." },
      { name: "Seek professional detailing for severe etching", text: "If DIY methods fail or deep etching is present, take your car to a professional detailer. They have access to rotary polishers, wet sanding, and industrial-grade compounds to restore damaged paint." },
    ],
  },
  "how-to-wash-a-new-car-first-time": {
    name: "How to Wash a New Car for the First Time",
    description: "Safely wash and protect a new car's paint using methods that prevent swirl marks and preserve the factory finish.",
    steps: [
      { name: "Choose a safe washing method", text: "Select either a touchless automatic car wash with spot-free rinse or a two-bucket hand wash at home. Avoid automatic brush washes and harsh detergents that can damage new paint." },
      { name: "Rinse the car thoroughly", text: "Remove all loose dirt and debris with water before any physical contact with the paint surface. This prevents scratching during the wash process." },
      { name: "Wash from top to bottom", text: "Use a quality microfiber wash mitt and dedicated car wash shampoo, starting with the roof and hood, then sides, saving lower panels for last. If hand washing, rinse your mitt in clean water between passes." },
      { name: "Rinse and dry immediately", text: "Thoroughly rinse all soap from the vehicle and dry promptly using a microfiber drying towel. Never let water air-dry to avoid water spots." },
      { name: "Apply paint protection immediately", text: "While the paint is clean and uncontaminated, apply spray wax, paste wax, paint sealant, or ceramic coating. This protects the fresh paint and maintains the new appearance." },
      { name: "Establish a regular washing schedule", text: "Wash your new car every one to two weeks to prevent contaminants like bird droppings, tree sap, and rail dust from bonding to and etching the clear coat." },
    ],
  },
  "how-to-wash-car-in-winter-without-damaging-paint": {
    name: "How to Wash Your Car in Winter Without Damaging the Paint",
    description: "Keep your car clean and protected from road salt and winter corrosion with safe washing methods throughout the cold season.",
    steps: [
      { name: "Apply protective wax or sealant in fall", text: "Before winter begins, apply a wax or sealant to your car's exterior. This protective coating makes it harder for road salt to bond to your paint and provides a barrier against corrosion." },
      { name: "Wash every 10-14 days or after salt events", text: "Schedule washes every 10-14 days during winter, or immediately after snowfall, ice storms, or heavy road salt application. Wash more frequently if your area receives constant snow and road treatment." },
      { name: "Use a touchless car wash with undercarriage spray", text: "Choose a touchless automatic car wash that offers undercarriage wash options. High-pressure water blasts off caked-on salt and grime without frozen brushes scratching your paint, while you stay warm inside." },
      { name: "Focus cleaning on undercarriage and wheel wells", text: "Prioritize the undercarriage, wheel wells, and rocker panels where salt accumulates most heavily. These hidden areas are most vulnerable to corrosion and require thorough rinsing to remove salt deposits." },
      { name: "Use spot-free rinse to prevent freezing", text: "Finish with a spot-free rinse option if available. This helps prevent water from freezing on your paint and reduces ice formation on the vehicle surface." },
      { name: "Dry door seals and jambs thoroughly", text: "After washing, dry all door seals, door jambs, and trim completely to prevent water from freezing. Open and close all doors to break up any remaining moisture in the seals." },
    ],
  },
  "touchless-car-wash-tips": {
    name: "How to Get the Most Out of Your Touchless Car Wash",
    description: "Follow these steps to maximize cleanliness and results when using an automatic touchless car wash system.",
    steps: [
      { name: "Pre-rinse heavy contamination before entering", text: "If your car has heavy mud, dried bugs, or bird droppings, remove large debris by hand or use a self-serve pressure washer. Spray bug remover on the front bumper and spot-treat bird droppings with a damp microfiber towel before entering the touchless bay." },
      { name: "Choose the appropriate wash tier", text: "Select a mid-tier wash that includes triple foam, wheel cleaning, and a spot-free rinse for best value. The spot-free rinse uses purified water that prevents mineral deposits and water spots when it dries." },
      { name: "Close windows and retract mirrors", text: "Close all windows and sunroof completely, retract power mirrors if available, and fold in aftermarket accessories like tow mirrors. Lower your antenna if it's a manual mast type to prevent water intrusion and damage." },
      { name: "Stay centered on the track", text: "Follow the attendant's guidance and use tire guides to position your vehicle centered on the track or between gantry arms. Proper centering ensures even chemical coverage, consistent water pressure, and better drying performance across all panels." },
      { name: "Dry detail areas after the wash", text: "Use a clean microfiber towel to wipe down side mirrors, door handles, the gas cap area, and window edges where water collects. This two-minute touchup prevents water spots and drip marks as trapped water dries." },
    ],
  },
};

export function getHowTo(slug: string): HowToPostData | null {
  return BLOG_HOWTO_STEPS[slug] ?? null;
}
