/*
  # Add city descriptions for 5 thin city pages

  These 5 small-town city pages were flagged by Google as "Crawled - currently not indexed"
  likely due to thin content. Adding unique descriptions helps differentiate them.
*/

INSERT INTO city_descriptions (state, city, description, generated_at)
VALUES
  (
    'WI',
    'Evansville',
    'Evansville, Wisconsin is a small community in Rock County where touchless car washes offer a convenient way to keep your vehicle clean without risking paint damage from brushes. Southern Wisconsin''s mix of harsh winters with heavy road salt and humid summers with pollen and agricultural dust make touchless washing especially valuable. A touchless car wash uses only high-pressure water and specially formulated detergents — no brushes or cloth ever touch your vehicle — making it the safest automated wash option for protecting your car''s finish year-round.',
    now()
  ),
  (
    'OH',
    'Millersburg',
    'Millersburg, the county seat of Holmes County in east-central Ohio, sits at the heart of Amish Country where rural roads and seasonal weather take a toll on vehicles. Ohio''s winters bring heavy road salt and brine treatments, while spring and fall bring mud and agricultural runoff from surrounding farmland. A touchless car wash removes these corrosive contaminants using high-pressure water jets — no brushes or abrasive materials — keeping your paint scratch-free and your undercarriage protected from salt damage.',
    now()
  ),
  (
    'MO',
    'Carthage',
    'Carthage, Missouri sits along the historic Route 66 corridor in Jasper County, where vehicles face a mix of Midwest weather challenges. The region''s humid continental climate brings ice storms and road salt in winter, heavy pollen in spring, and dust from nearby mining and agricultural operations in summer. Touchless car washes are the safest choice here — high-pressure water and chemical cleaners strip away road salt, mineral dust, and pollen without the scratching risk that comes with traditional brush-based washes.',
    now()
  ),
  (
    'IA',
    'Rock Valley',
    'Rock Valley is a small community in Sioux County in northwest Iowa, where prairie winds and extreme seasonal weather create constant challenges for vehicle maintenance. Iowa winters are among the harshest in the Midwest, with heavy road salt and sand applications on highways, while summer brings agricultural dust, corn pollen, and insect residue from rural driving. A touchless car wash uses only high-pressure water and detergents to clean your vehicle — no brushes that could grind road salt or grit into your paint — making it the best option for preserving your finish in this demanding climate.',
    now()
  ),
  (
    'KY',
    'Russell Springs',
    'Russell Springs, Kentucky is a gateway community to Lake Cumberland in Russell County, where vehicles encounter a mix of rural road dust, seasonal pollen, and winter road treatments. Kentucky''s humid subtropical climate promotes rapid pollen buildup in spring and mold growth on vehicle surfaces during the warm, damp months. Touchless car washes are ideal here — they use high-pressure water jets and specialized detergents to remove stubborn contaminants without any physical contact, protecting your car''s paint from the micro-scratches that brush washes can leave behind.',
    now()
  )
ON CONFLICT (state, city)
DO UPDATE SET
  description = EXCLUDED.description,
  generated_at = EXCLUDED.generated_at,
  updated_at = now();
