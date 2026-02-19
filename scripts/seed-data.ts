import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const sampleListings = [
  {
    name: 'Sunshine Touchless Car Wash',
    slug: 'sunshine-touchless-car-wash',
    address: '123 Main Street',
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    phone: '(214) 555-0100',
    website: 'https://sunshine-carwash.example.com',
    hours: {
      monday: '8:00 AM - 8:00 PM',
      tuesday: '8:00 AM - 8:00 PM',
      wednesday: '8:00 AM - 8:00 PM',
      thursday: '8:00 AM - 8:00 PM',
      friday: '8:00 AM - 9:00 PM',
      saturday: '7:00 AM - 9:00 PM',
      sunday: '9:00 AM - 6:00 PM',
    },
    wash_packages: [
      { name: 'Basic Wash', price: '$12', description: 'Touchless wash with soap and rinse' },
      { name: 'Premium Wash', price: '$18', description: 'Includes wax and tire shine' },
      { name: 'Deluxe Wash', price: '$25', description: 'Full service with undercarriage and spot-free rinse' },
    ],
    amenities: ['24/7 Access', 'Free Vacuums', 'Spot-Free Rinse', 'Tire Shine', 'Undercarriage Wash'],
    photos: [],
    rating: 4.7,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Crystal Clean Auto Wash',
    slug: 'crystal-clean-auto-wash',
    address: '456 Oak Avenue',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    phone: '(512) 555-0200',
    website: 'https://crystal-clean.example.com',
    hours: {
      monday: '7:00 AM - 9:00 PM',
      tuesday: '7:00 AM - 9:00 PM',
      wednesday: '7:00 AM - 9:00 PM',
      thursday: '7:00 AM - 9:00 PM',
      friday: '7:00 AM - 10:00 PM',
      saturday: '6:00 AM - 10:00 PM',
      sunday: '8:00 AM - 8:00 PM',
    },
    wash_packages: [
      { name: 'Express Wash', price: '$10', description: 'Quick touchless wash' },
      { name: 'Premium Shine', price: '$20', description: 'Premium wash with protective coating' },
      { name: 'Ultimate Package', price: '$30', description: 'Everything included plus rain repellent' },
    ],
    amenities: ['Free Vacuums', 'Air Freshener', 'Wax Protection', 'Rain Repellent', 'Loyalty Program'],
    photos: [],
    rating: 4.8,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Miami Beach Touch-Free Wash',
    slug: 'miami-beach-touch-free-wash',
    address: '789 Ocean Drive',
    city: 'Miami',
    state: 'FL',
    zip: '33139',
    phone: '(305) 555-0300',
    website: 'https://miami-touchfree.example.com',
    hours: {
      monday: '6:00 AM - 10:00 PM',
      tuesday: '6:00 AM - 10:00 PM',
      wednesday: '6:00 AM - 10:00 PM',
      thursday: '6:00 AM - 10:00 PM',
      friday: '6:00 AM - 11:00 PM',
      saturday: '6:00 AM - 11:00 PM',
      sunday: '7:00 AM - 9:00 PM',
    },
    wash_packages: [
      { name: 'Quick Wash', price: '$15', description: 'Fast touchless cleaning' },
      { name: 'Salt Buster', price: '$22', description: 'Special saltwater protection' },
      { name: 'Full Protect', price: '$28', description: 'Complete protection package' },
    ],
    amenities: ['24/7 Access', 'Spot-Free Rinse', 'Undercarriage Wash', 'Wheel Cleaning', 'Pet Wash Station'],
    photos: [],
    rating: 4.6,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Golden State Touchless',
    slug: 'golden-state-touchless',
    address: '321 Sunset Boulevard',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90028',
    phone: '(323) 555-0400',
    website: 'https://golden-state-wash.example.com',
    hours: {
      monday: '7:00 AM - 9:00 PM',
      tuesday: '7:00 AM - 9:00 PM',
      wednesday: '7:00 AM - 9:00 PM',
      thursday: '7:00 AM - 9:00 PM',
      friday: '7:00 AM - 10:00 PM',
      saturday: '6:00 AM - 10:00 PM',
      sunday: '8:00 AM - 8:00 PM',
    },
    wash_packages: [
      { name: 'Basic Clean', price: '$14', description: 'Essential touchless wash' },
      { name: 'Premium Shine', price: '$21', description: 'Added wax and protection' },
      { name: 'Hollywood Special', price: '$32', description: 'Ultimate shine package' },
    ],
    amenities: ['Free Vacuums', 'Air Freshener', 'Wax Protection', 'Tire Shine', 'Loyalty Program'],
    photos: [],
    rating: 4.9,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Bay Area Touch-Free Express',
    slug: 'bay-area-touch-free-express',
    address: '555 Market Street',
    city: 'San Francisco',
    state: 'CA',
    zip: '94102',
    phone: '(415) 555-0500',
    website: 'https://bayarea-touchfree.example.com',
    hours: {
      monday: '8:00 AM - 8:00 PM',
      tuesday: '8:00 AM - 8:00 PM',
      wednesday: '8:00 AM - 8:00 PM',
      thursday: '8:00 AM - 8:00 PM',
      friday: '8:00 AM - 9:00 PM',
      saturday: '7:00 AM - 9:00 PM',
      sunday: '9:00 AM - 7:00 PM',
    },
    wash_packages: [
      { name: 'Express Wash', price: '$16', description: 'Quick and efficient' },
      { name: 'Premium Package', price: '$24', description: 'Enhanced protection' },
      { name: 'Executive Wash', price: '$35', description: 'Premium service' },
    ],
    amenities: ['Spot-Free Rinse', 'Undercarriage Wash', 'Wheel Cleaning', 'Rain Repellent', 'Self-Service Bays'],
    photos: [],
    rating: 4.5,
    review_count: 0,
    is_approved: true,
    is_featured: false,
  },
  {
    name: 'Phoenix Desert Touchless',
    slug: 'phoenix-desert-touchless',
    address: '888 Desert Road',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    phone: '(602) 555-0600',
    website: 'https://phoenix-desert.example.com',
    hours: {
      monday: '6:00 AM - 9:00 PM',
      tuesday: '6:00 AM - 9:00 PM',
      wednesday: '6:00 AM - 9:00 PM',
      thursday: '6:00 AM - 9:00 PM',
      friday: '6:00 AM - 10:00 PM',
      saturday: '6:00 AM - 10:00 PM',
      sunday: '7:00 AM - 8:00 PM',
    },
    wash_packages: [
      { name: 'Dust Buster', price: '$13', description: 'Perfect for desert conditions' },
      { name: 'Premium Clean', price: '$19', description: 'Enhanced dust protection' },
      { name: 'Desert Shield', price: '$27', description: 'Maximum protection' },
    ],
    amenities: ['24/7 Access', 'Free Vacuums', 'Spot-Free Rinse', 'Tire Shine', 'Air Freshener'],
    photos: [],
    rating: 4.7,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Windy City Touchless Wash',
    slug: 'windy-city-touchless-wash',
    address: '100 Michigan Avenue',
    city: 'Chicago',
    state: 'IL',
    zip: '60601',
    phone: '(312) 555-0700',
    website: 'https://windycity-wash.example.com',
    hours: {
      monday: '7:00 AM - 8:00 PM',
      tuesday: '7:00 AM - 8:00 PM',
      wednesday: '7:00 AM - 8:00 PM',
      thursday: '7:00 AM - 8:00 PM',
      friday: '7:00 AM - 9:00 PM',
      saturday: '6:00 AM - 9:00 PM',
      sunday: '8:00 AM - 7:00 PM',
    },
    wash_packages: [
      { name: 'Basic Wash', price: '$11', description: 'Standard touchless service' },
      { name: 'Winter Guard', price: '$18', description: 'Salt removal and protection' },
      { name: 'Premium Package', price: '$26', description: 'Complete protection' },
    ],
    amenities: ['Free Vacuums', 'Undercarriage Wash', 'Wheel Cleaning', 'Wax Protection', 'Loyalty Program'],
    photos: [],
    rating: 4.6,
    review_count: 0,
    is_approved: true,
    is_featured: false,
  },
  {
    name: 'Big Apple Touch-Free',
    slug: 'big-apple-touch-free',
    address: '500 Broadway',
    city: 'New York',
    state: 'NY',
    zip: '10012',
    phone: '(212) 555-0800',
    website: 'https://bigapple-touchfree.example.com',
    hours: {
      monday: '24 Hours',
      tuesday: '24 Hours',
      wednesday: '24 Hours',
      thursday: '24 Hours',
      friday: '24 Hours',
      saturday: '24 Hours',
      sunday: '24 Hours',
    },
    wash_packages: [
      { name: 'Express NYC', price: '$17', description: 'Fast city wash' },
      { name: 'Premium Shine', price: '$25', description: 'Enhanced cleaning' },
      { name: 'Manhattan Special', price: '$38', description: 'Top-tier service' },
    ],
    amenities: ['24/7 Access', 'Spot-Free Rinse', 'Undercarriage Wash', 'Rain Repellent', 'Pet Wash Station'],
    photos: [],
    rating: 4.8,
    review_count: 0,
    is_approved: true,
    is_featured: true,
  },
  {
    name: 'Seattle Rain Shield Wash',
    slug: 'seattle-rain-shield-wash',
    address: '200 Pike Place',
    city: 'Seattle',
    state: 'WA',
    zip: '98101',
    phone: '(206) 555-0900',
    website: 'https://seattle-rainshield.example.com',
    hours: {
      monday: '7:00 AM - 9:00 PM',
      tuesday: '7:00 AM - 9:00 PM',
      wednesday: '7:00 AM - 9:00 PM',
      thursday: '7:00 AM - 9:00 PM',
      friday: '7:00 AM - 10:00 PM',
      saturday: '6:00 AM - 10:00 PM',
      sunday: '8:00 AM - 8:00 PM',
    },
    wash_packages: [
      { name: 'Quick Rinse', price: '$14', description: 'Fast and effective' },
      { name: 'Rain Repel', price: '$22', description: 'Special rain protection' },
      { name: 'Pacific Package', price: '$29', description: 'Complete care' },
    ],
    amenities: ['Free Vacuums', 'Rain Repellent', 'Wax Protection', 'Tire Shine', 'Self-Service Bays'],
    photos: [],
    rating: 4.7,
    review_count: 0,
    is_approved: true,
    is_featured: false,
  },
  {
    name: 'Denver Mountain Touchless',
    slug: 'denver-mountain-touchless',
    address: '777 Colfax Avenue',
    city: 'Denver',
    state: 'CO',
    zip: '80202',
    phone: '(303) 555-1000',
    website: 'https://denver-mountain.example.com',
    hours: {
      monday: '7:00 AM - 8:00 PM',
      tuesday: '7:00 AM - 8:00 PM',
      wednesday: '7:00 AM - 8:00 PM',
      thursday: '7:00 AM - 8:00 PM',
      friday: '7:00 AM - 9:00 PM',
      saturday: '6:00 AM - 9:00 PM',
      sunday: '8:00 AM - 7:00 PM',
    },
    wash_packages: [
      { name: 'Basic Clean', price: '$12', description: 'Essential wash service' },
      { name: 'Mountain Fresh', price: '$19', description: 'Enhanced with wax' },
      { name: 'Alpine Premium', price: '$28', description: 'Full protection suite' },
    ],
    amenities: ['Spot-Free Rinse', 'Undercarriage Wash', 'Wheel Cleaning', 'Air Freshener', 'Loyalty Program'],
    photos: [],
    rating: 4.5,
    review_count: 0,
    is_approved: true,
    is_featured: false,
  },
];

const sampleReviews = [
  {
    author_name: 'John Smith',
    rating: 5,
    comment: 'Excellent touchless car wash! My car looks brand new every time. The staff is friendly and the facility is always clean.',
  },
  {
    author_name: 'Sarah Johnson',
    rating: 4,
    comment: 'Great service and convenient location. The premium wash package is worth the extra money.',
  },
  {
    author_name: 'Mike Davis',
    rating: 5,
    comment: 'Best touchless car wash in the area. Love that they have free vacuums and the wash quality is consistently excellent.',
  },
  {
    author_name: 'Emily Chen',
    rating: 4,
    comment: 'Quick and efficient service. The touchless system does a thorough job without damaging the paint.',
  },
  {
    author_name: 'Robert Martinez',
    rating: 5,
    comment: 'Been coming here for years. Always reliable and my car comes out sparkling clean every time.',
  },
];

const sampleBlogPosts = [
  {
    title: 'Why Touchless Car Washes Are Better for Your Vehicle',
    slug: 'why-touchless-car-washes-are-better',
    content: `Touchless car washes have revolutionized the way we clean our vehicles. Unlike traditional car washes that use brushes and cloths, touchless systems rely solely on high-pressure water jets and specialized detergents to clean your car.

The main advantage of touchless car washes is that they eliminate the risk of scratches and swirl marks that can occur with brush-based systems. Traditional brushes can trap dirt and debris, which can then scratch your car's paint during the washing process.

Touchless car washes are also more hygienic. Since there are no brushes or cloths that touch multiple vehicles, there's no risk of transferring contaminants from one car to another. This is particularly important if you're concerned about maintaining your vehicle's finish.

Modern touchless car wash systems use advanced cleaning solutions that are specifically formulated to break down dirt and grime without physical contact. These detergents are safe for all types of paint and clear coats, and they're environmentally friendly too.

Another benefit is the speed and convenience. Touchless car washes are typically faster than traditional methods, and many locations offer 24/7 access, making it easy to fit a car wash into your busy schedule.

If you care about maintaining your vehicle's appearance and protecting your investment, a touchless car wash is the smart choice.`,
    excerpt: 'Discover why touchless car washes are the safer, more effective choice for keeping your vehicle clean and protecting its finish.',
    category: 'Car Care Tips',
    published_at: new Date().toISOString(),
  },
  {
    title: 'How Often Should You Wash Your Car?',
    slug: 'how-often-should-you-wash-your-car',
    content: `One of the most common questions car owners ask is: how often should I wash my car? The answer depends on several factors including where you live, how often you drive, and the conditions your vehicle is exposed to.

As a general rule, washing your car every two weeks is a good baseline for most drivers. However, if you live in an area with harsh weather conditions, you may need to wash more frequently.

If you live near the coast, salt air can accelerate corrosion on your vehicle. In this case, washing your car weekly is recommended. The same applies if you live in an area where roads are salted in winter.

For those who live in dusty or desert environments, regular washing helps prevent abrasive particles from damaging your paint. Again, weekly washing is ideal.

If you park your car under trees, bird droppings and tree sap can damage your paint if left too long. Wash your car as soon as you notice these contaminants.

Remember, regular washing isn't just about aesthetics – it's about protecting your investment. A clean car is easier to inspect for damage, and regular washing can extend the life of your vehicle's finish.

Using a touchless car wash makes it easy to maintain a regular washing schedule without the hassle of doing it yourself.`,
    excerpt: 'Learn how frequently you should wash your car based on your location, driving habits, and environmental conditions.',
    category: 'Maintenance',
    published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

async function seedData() {
  console.log('Starting to seed data...');

  console.log('Inserting listings...');
  const { data: insertedListings, error: listingsError } = await supabase
    .from('listings')
    .insert(sampleListings)
    .select();

  if (listingsError) {
    console.error('Error inserting listings:', listingsError);
    return;
  }

  console.log(`Inserted ${insertedListings?.length} listings`);

  console.log('Inserting reviews...');
  for (const listing of insertedListings || []) {
    const reviewsToInsert = sampleReviews.slice(0, 3).map((review) => ({
      ...review,
      listing_id: listing.id,
    }));

    const { error: reviewsError } = await supabase
      .from('reviews')
      .insert(reviewsToInsert);

    if (reviewsError) {
      console.error(`Error inserting reviews for ${listing.name}:`, reviewsError);
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update({ review_count: reviewsToInsert.length })
      .eq('id', listing.id);

    if (updateError) {
      console.error(`Error updating review count for ${listing.name}:`, updateError);
    }
  }

  console.log('Inserting blog posts...');
  const { error: blogError } = await supabase
    .from('blog_posts')
    .insert(sampleBlogPosts);

  if (blogError) {
    console.error('Error inserting blog posts:', blogError);
  }

  console.log('Data seeding completed!');
}

seedData();
