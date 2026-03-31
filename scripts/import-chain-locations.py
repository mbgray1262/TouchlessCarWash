#!/usr/bin/env python3
"""
Import confirmed touchless car wash locations from authoritative chain sources.

Sources:
  1. Holiday Stationstores / Circle K  — circlek.com/us/holiday-station/car-wash/unlimited/locations
     246 locations across MN, WI, ND, SD, MT, MI, AK, ID — Touch Free confirmed per location
  2. Power Market (CA/NV/OR) — pwrmarket.com/locations-category/car-wash-touchless-drive-through/
     218 locations — all confirmed touchless drive-through

Later phases (separate runs):
  3. Kwik Trip WI  — 96 TF locations from their official PDF
  4. BellStores OH — ~42 touchless locations

Pipeline per location:
  - Check if address already in DB (skip if yes)
  - Call DataForSEO my_business_info/live to find Place ID + enrich data
  - Insert with is_touchless=true, touchless_verified='chain'
  - Review mining runs separately via scan_batch to collect snippets

Progress saved to scripts/import-chain-progress.json (resumable).
Logs to: scripts/import-chain.log
"""
import os, json, re, ssl, urllib.request, urllib.error, time, datetime, subprocess

def upscale_google_photo(url: str | None) -> str | None:
    """Upscale Google Photos URLs to w1600-h1200. Reject expiring gps-cs-s session tokens."""
    if not url:
        return url
    # gps-cs-s URLs contain short-lived session tokens — they expire within hours
    if '/gps-cs-s/' in url:
        return None
    if 'googleusercontent.com' in url or 'lh3.google' in url:
        base = re.sub(r'=[^/=]+$', '', url)
        return f'{base}=w1600-h1200'
    return url

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DATAFORSEO_KEY = 'bWljaGFlbEB0b3VjaGxlc3NjYXJ3YXNoZmluZGVyLmNvbTo0ZTQyOWQxMjdhOTExZDdh'
SUPABASE_URL   = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
EDGE_BASE      = f'{SUPABASE_URL}/functions/v1'

SCRIPT_DIR     = os.path.dirname(__file__)
LOG_FILE       = os.path.join(SCRIPT_DIR, 'import-chain.log')
PROGRESS_FILE  = os.path.join(SCRIPT_DIR, 'import-chain-progress.json')

# ── Location data ──────────────────────────────────────────────────────────────

# Holiday Stationstores — Touch Free confirmed locations only
# Source: circlek.com/us/holiday-station/car-wash/unlimited/locations
# "Soft Cloth" only entries excluded; "Touch Free" and "Touch Free, Soft Cloth" included
HOLIDAY_LOCATIONS = [
    {"address": "702 6th Avenue SE", "city": "Aberdeen", "state": "SD"},
    {"address": "1 Minnesota Avenue S", "city": "Aitkin", "state": "MN"},
    {"address": "650 50th Avenue West", "city": "Alexandria", "state": "MN"},
    {"address": "785 N. Nokomis NE", "city": "Alexandria", "state": "MN"},
    {"address": "285 Muldoon Road", "city": "Anchorage", "state": "AK"},
    {"address": "3500 C Street", "city": "Anchorage", "state": "AK"},
    {"address": "5980 149th Street", "city": "Apple Valley", "state": "MN"},
    {"address": "15550 Cedar Avenue", "city": "Apple Valley", "state": "MN"},
    {"address": "14113 Galaxie Avenue", "city": "Apple Valley", "state": "MN"},
    {"address": "1920 Highway 96", "city": "Arden Hills", "state": "MN"},
    {"address": "110 Ellis Avenue", "city": "Ashland", "state": "WI"},
    {"address": "7472 Excelsior Road", "city": "Baxter", "state": "MN"},
    {"address": "402 Belgrade Blvd.", "city": "Belgrade", "state": "MT"},
    {"address": "281 Jefferson Blvd.", "city": "Big Lake", "state": "MN"},
    {"address": "4041 Grand Ave.", "city": "Billings", "state": "MT"},
    {"address": "790 S Billings Blvd", "city": "Billings", "state": "MT"},
    {"address": "785 S 20th St W", "city": "Billings", "state": "MT"},
    {"address": "3551 Ember Lane", "city": "Billings", "state": "MT"},
    {"address": "1212 Mullowney Lane", "city": "Billings", "state": "MT"},
    {"address": "3600 State Street", "city": "Bismarck", "state": "ND"},
    {"address": "3815 Trenton Drive", "city": "Bismarck", "state": "ND"},
    {"address": "9933 Ulysses Street NE", "city": "Blaine", "state": "MN"},
    {"address": "50 West 98th Street", "city": "Bloomington", "state": "MN"},
    {"address": "5401 W. Old Shakopee Rd", "city": "Bloomington", "state": "MN"},
    {"address": "1951 Durston Road", "city": "Bozeman", "state": "MT"},
    {"address": "920 N Splitrock Blvd", "city": "Brandon", "state": "SD"},
    {"address": "420 66th Ave. N.", "city": "Brooklyn Center", "state": "MN"},
    {"address": "8517 Jefferson Lane North", "city": "Brooklyn Park", "state": "MN"},
    {"address": "9399 West Broadway", "city": "Brooklyn Park", "state": "MN"},
    {"address": "7 N.E. 8th Street", "city": "Buffalo", "state": "MN"},
    {"address": "900 West Burnsville Parkway", "city": "Burnsville", "state": "MN"},
    {"address": "12290 Nicollet Ave South", "city": "Burnsville", "state": "MN"},
    {"address": "6210 109th Ave No.", "city": "Champlin", "state": "MN"},
    {"address": "501 N. Bridge Street", "city": "Chippewa Falls", "state": "WI"},
    {"address": "450 Highway 7 SE", "city": "Clara City", "state": "MN"},
    {"address": "409 Paul Ave S", "city": "Cologne", "state": "MN"},
    {"address": "4259 Central Ave. N.E.", "city": "Columbia Heights", "state": "MN"},
    {"address": "202 101st Avenue NW", "city": "Coon Rapids", "state": "MN"},
    {"address": "13051 Round Lake Blvd. NW", "city": "Coon Rapids", "state": "MN"},
    {"address": "8101 Hadley Ave. S.", "city": "Cottage Grove", "state": "MN"},
    {"address": "8610 E. Point Douglas Road", "city": "Cottage Grove", "state": "MN"},
    {"address": "7033 Jorgensen Lane S", "city": "Cottage Grove", "state": "MN"},
    {"address": "5410 Lakeland Ave", "city": "Crystal", "state": "MN"},
    {"address": "23736 Front Street", "city": "Deerwood", "state": "MN"},
    {"address": "303 Frazee Street E", "city": "Detroit Lakes", "state": "MN"},
    {"address": "5430 Grand Avenue", "city": "Duluth", "state": "MN"},
    {"address": "210 S 27th Ave West", "city": "Duluth", "state": "MN"},
    {"address": "1520 Kenwood Avenue", "city": "Duluth", "state": "MN"},
    {"address": "3301 W. Arrowhead Road", "city": "Duluth", "state": "MN"},
    {"address": "5699 Miller Trunk Highway", "city": "Duluth", "state": "MN"},
    {"address": "1065 Diffley Road", "city": "Eagan", "state": "MN"},
    {"address": "4595 Nicols Road", "city": "Eagan", "state": "MN"},
    {"address": "3044 Holiday Lane", "city": "Eagan", "state": "MN"},
    {"address": "2660 Eagan Woods Drive", "city": "Eagan", "state": "MN"},
    {"address": "1579 Cliff Road", "city": "Eagan", "state": "MN"},
    {"address": "1010 Central Avenue NE", "city": "East Grand Forks", "state": "MN"},
    {"address": "2109 Highland Avenue", "city": "Eau Claire", "state": "WI"},
    {"address": "4304 Jeffers Road", "city": "Eau Claire", "state": "WI"},
    {"address": "2806 Golf Road", "city": "Eau Claire", "state": "WI"},
    {"address": "2230 Birch Street", "city": "Eau Claire", "state": "WI"},
    {"address": "2940 N. Clairemont Avenue", "city": "Eau Claire", "state": "WI"},
    {"address": "13445 Business Center Drive", "city": "Elk River", "state": "MN"},
    {"address": "18823 Freeport Avenue", "city": "Elk River", "state": "MN"},
    {"address": "456 West Main Street", "city": "Ellsworth", "state": "WI"},
    {"address": "700 N. Lincoln Road", "city": "Escanaba", "state": "MI"},
    {"address": "3040 25th Street South", "city": "Fargo", "state": "ND"},
    {"address": "1902 45th Street S.", "city": "Fargo", "state": "ND"},
    {"address": "2755 Brandt Drive South", "city": "Fargo", "state": "ND"},
    {"address": "5651 36th Avenue S", "city": "Fargo", "state": "ND"},
    {"address": "5168 38th Street South", "city": "Fargo", "state": "ND"},
    {"address": "200 57th Avenue NE", "city": "Fridley", "state": "MN"},
    {"address": "3450 32nd Avenue", "city": "Grand Forks", "state": "ND"},
    {"address": "4005 South Washington Street", "city": "Grand Forks", "state": "ND"},
    {"address": "202 East 4th Street", "city": "Grand Rapids", "state": "MN"},
    {"address": "601 Northwest Bypass", "city": "Great Falls", "state": "MT"},
    {"address": "1442 Crosstown Blvd. NE", "city": "Ham Lake", "state": "MN"},
    {"address": "12370 Pt. Douglas Dr", "city": "Hastings", "state": "MN"},
    {"address": "8100 Corner Stone Drive", "city": "Hayden", "state": "ID"},
    {"address": "2517 13th Ave E", "city": "Hibbing", "state": "MN"},
    {"address": "210 S. Second Street", "city": "Hudson", "state": "WI"},
    {"address": "6976 Cahill Avenue", "city": "Inver Grove Heights", "state": "MN"},
    {"address": "9087 Broderick Blvd.", "city": "Inver Grove Heights", "state": "MN"},
    {"address": "255 Triangle Lane", "city": "Jordan", "state": "MN"},
    {"address": "215 Manning Avenue N.", "city": "Lake Elmo", "state": "MN"},
    {"address": "7287 161st Street West", "city": "Lakeville", "state": "MN"},
    {"address": "1536 Silverstone Trail", "city": "Ledgeview", "state": "WI"},
    {"address": "504 Bryden Ave", "city": "Lewiston", "state": "ID"},
    {"address": "12970 Lake Blvd.", "city": "Lindstrom", "state": "MN"},
    {"address": "1704 1st Avenue NE", "city": "Little Falls", "state": "MN"},
    {"address": "780 Stillwater Road", "city": "Mahtomedi", "state": "MN"},
    {"address": "1901 Adams Street", "city": "Mankato", "state": "MN"},
    {"address": "11201 93rd Avenue North", "city": "Maple Grove", "state": "MN"},
    {"address": "280 McKnight Road South", "city": "Maplewood", "state": "MN"},
    {"address": "1535 Beam Avenue", "city": "Maplewood", "state": "MN"},
    {"address": "200 W. Hwy 210", "city": "McGregor", "state": "MN"},
    {"address": "200 Highway 55", "city": "Medina", "state": "MN"},
    {"address": "12 Aspen Avenue SE", "city": "Menahga", "state": "MN"},
    {"address": "1312 W. Main Street", "city": "Merrill", "state": "WI"},
    {"address": "4601 Hiawatha Avenue", "city": "Minneapolis", "state": "MN"},
    {"address": "1301 Industrial Blvd NE", "city": "Minneapolis", "state": "MN"},
    {"address": "3550 Cedar Avenue South", "city": "Minneapolis", "state": "MN"},
    {"address": "7700 34th Avenue S", "city": "Minneapolis", "state": "MN"},
    {"address": "1624 Washington Avenue N.", "city": "Minneapolis", "state": "MN"},
    {"address": "1617 Broadway St. NE", "city": "Minneapolis", "state": "MN"},
    {"address": "3301 South Broadway", "city": "Minot", "state": "ND"},
    {"address": "2325 So. Reserve St.", "city": "Missoula", "state": "MT"},
    {"address": "110 Oakwood Drive", "city": "Monticello", "state": "MN"},
    {"address": "3475 28th Avenue S.", "city": "Moorhead", "state": "MN"},
    {"address": "725 30th Avenue South", "city": "Moorhead", "state": "MN"},
    {"address": "700 S. Highway 65", "city": "Mora", "state": "MN"},
    {"address": "16 Highway 10 South", "city": "Motley", "state": "MN"},
    {"address": "301 E. Munising", "city": "Munising", "state": "MI"},
    {"address": "2420 Shadywood Rd", "city": "Navarre", "state": "MN"},
    {"address": "201 West County Road E2", "city": "New Brighton", "state": "MN"},
    {"address": "9456 Medicine Lake Road", "city": "New Hope", "state": "MN"},
    {"address": "102 10th Avenue NE", "city": "New Prague", "state": "MN"},
    {"address": "1201 West Ridge Road", "city": "New Ulm", "state": "MN"},
    {"address": "5554 St. Croix Trail", "city": "North Branch", "state": "MN"},
    {"address": "2255 East South Avenue", "city": "North St. Paul", "state": "MN"},
    {"address": "502 North Faxon Road", "city": "Norwood", "state": "MN"},
    {"address": "3344 Hadley Avenue N.", "city": "Oakdale", "state": "MN"},
    {"address": "695 W. Bridge St.", "city": "Owatonna", "state": "MN"},
    {"address": "10100 County Rd #9", "city": "Plymouth", "state": "MN"},
    {"address": "9705 Schmidt Lake Road", "city": "Plymouth", "state": "MN"},
    {"address": "2725 Campus Drive", "city": "Plymouth", "state": "MN"},
    {"address": "12650 County Road 10", "city": "Plymouth", "state": "MN"},
    {"address": "236 Broad Street N", "city": "Prescott", "state": "WI"},
    {"address": "16800 Duluth Ave. SE", "city": "Prior Lake", "state": "MN"},
    {"address": "14350 Xkimo Street", "city": "Ramsey", "state": "MN"},
    {"address": "14075 Ramsey Blvd.", "city": "Ramsey", "state": "MN"},
    {"address": "1846 Eglin Street", "city": "Rapid City", "state": "SD"},
    {"address": "3216 E Hwy 44", "city": "Rapid City", "state": "SD"},
    {"address": "35 Omaha Street", "city": "Rapid City", "state": "SD"},
    {"address": "1610 Caregiver Circle", "city": "Rapid City", "state": "SD"},
    {"address": "2460 W. Chicago St.", "city": "Rapid City", "state": "SD"},
    {"address": "900 N Division Street", "city": "Roberts", "state": "WI"},
    {"address": "3225 40th Avenue NW", "city": "Rochester", "state": "MN"},
    {"address": "701 Broadway Avenue N", "city": "Rochester", "state": "MN"},
    {"address": "5505 Hwy 52 N", "city": "Rochester", "state": "MN"},
    {"address": "1851 Assisi Dr. NW", "city": "Rochester", "state": "MN"},
    {"address": "13028 Main Street", "city": "Rogers", "state": "MN"},
    {"address": "1583 West County Road C", "city": "Roseville", "state": "MN"},
    {"address": "1550 West 4th Street", "city": "Rush City", "state": "MN"},
    {"address": "304 College Avenue North", "city": "Saint Joseph", "state": "MN"},
    {"address": "1001 7th Street North", "city": "Sartell", "state": "MN"},
    {"address": "212 Riverside Avenue N.", "city": "Sartell", "state": "MN"},
    {"address": "1185 S Main", "city": "Sauk Centre", "state": "MN"},
    {"address": "3 North Benton Drive", "city": "Sauk Rapids", "state": "MN"},
    {"address": "1715 2nd Avenue North", "city": "Sauk Rapids", "state": "MN"},
    {"address": "1423 2nd Street N.", "city": "Sauk Rapids", "state": "MN"},
    {"address": "7800 126th St", "city": "Savage", "state": "MN"},
    {"address": "1381 Greenwood Court", "city": "Shakopee", "state": "MN"},
    {"address": "8002 Old Carriage Court North", "city": "Shakopee", "state": "MN"},
    {"address": "3901 Eagle Creek Blvd.", "city": "Shakopee", "state": "MN"},
    {"address": "6509 S. Louise Avenue", "city": "Sioux Falls", "state": "SD"},
    {"address": "3000 E. 26th St.", "city": "Sioux Falls", "state": "SD"},
    {"address": "1927 West 57th Street", "city": "Sioux Falls", "state": "SD"},
    {"address": "7125 West 26th Street", "city": "Sioux Falls", "state": "SD"},
    {"address": "3245 S. Sycamore Avenue", "city": "Sioux Falls", "state": "SD"},
    {"address": "7414 South Minnesota Avenue", "city": "Sioux Falls", "state": "SD"},
    {"address": "5212 W. 12th Street", "city": "Sioux Falls", "state": "SD"},
    {"address": "8101 University Ave NE", "city": "Spring Lake Park", "state": "MN"},
    {"address": "3810 Silver Lake Road NE", "city": "St. Anthony", "state": "MN"},
    {"address": "8720 State Hwy. No. 7", "city": "St. Bonifacius", "state": "MN"},
    {"address": "905 County Road 4", "city": "St. Cloud", "state": "MN"},
    {"address": "730 S. Highway 10", "city": "St. Cloud", "state": "MN"},
    {"address": "4200 Larabee Avenue NE", "city": "St. Michael", "state": "MN"},
    {"address": "629 Rice Street", "city": "St. Paul", "state": "MN"},
    {"address": "200 South Wabasha St", "city": "St. Paul", "state": "MN"},
    {"address": "1345 Marshall Avenue", "city": "St. Paul", "state": "MN"},
    {"address": "402 Westview Lane", "city": "Stanley", "state": "ND"},
    {"address": "1101 2nd Ave NE", "city": "Staples", "state": "MN"},
    {"address": "2500 W. Orleans Street", "city": "Stillwater", "state": "MN"},
    {"address": "2600 South Airport Road", "city": "Traverse City", "state": "MI"},
    {"address": "1793 Arboretum Blvd", "city": "Victoria", "state": "MN"},
    {"address": "1502 South 12th Avenue West", "city": "Virginia", "state": "MN"},
    {"address": "10700 10th Street W", "city": "Waconia", "state": "MN"},
    {"address": "157 South Waite Avenue", "city": "Waite Park", "state": "MN"},
    {"address": "107 8th Ave SE", "city": "Watford City", "state": "ND"},
    {"address": "306 South 18th Avenue", "city": "Wausau", "state": "WI"},
    {"address": "2020 Sheyenne Street", "city": "West Fargo", "state": "ND"},
    {"address": "1845 So. Robert Street", "city": "West St. Paul", "state": "MN"},
    {"address": "1800 E County Rd F", "city": "White Bear Lake", "state": "MN"},
    {"address": "5970 N. Hwy 61", "city": "White Bear Lake", "state": "MN"},
    {"address": "4540 Centerville Road", "city": "White Bear Lake", "state": "MN"},
    {"address": "118 Chandler Blvd. S", "city": "Williston", "state": "ND"},
    {"address": "113 58th Street W", "city": "Williston", "state": "ND"},
    {"address": "1408 Oxford Street", "city": "Worthington", "state": "MN"},
]

# Power Market — all confirmed touchless drive-through
# Source: pwrmarket.com/locations-category/car-wash-touchless-drive-through/
POWER_MARKET_LOCATIONS = [
    {"address": "700 N Brookhurst St", "city": "Anaheim", "state": "CA"},
    {"address": "1101 N Magnolia Ave", "city": "Anaheim", "state": "CA"},
    {"address": "201 S State College Blvd", "city": "Anaheim", "state": "CA"},
    {"address": "1975 Ponderosa St", "city": "Anderson", "state": "CA"},
    {"address": "3480 W Center St", "city": "Anderson", "state": "CA"},
    {"address": "1049 S Main St", "city": "Angels Camp", "state": "CA"},
    {"address": "7966 Walerga Rd", "city": "Antelope", "state": "CA"},
    {"address": "1401 G St", "city": "Arcata", "state": "CA"},
    {"address": "421 J St", "city": "Arcata", "state": "CA"},
    {"address": "10021 Combie Rd", "city": "Auburn", "state": "CA"},
    {"address": "3960 Grass Valley Hwy", "city": "Auburn", "state": "CA"},
    {"address": "3575 Willow Pass Rd", "city": "Bay Point", "state": "CA"},
    {"address": "8750 Brentwood Blvd", "city": "Brentwood", "state": "CA"},
    {"address": "6971 Beach Blvd", "city": "Buena Park", "state": "CA"},
    {"address": "4051 Cameron Park Dr", "city": "Cameron Park", "state": "CA"},
    {"address": "1649 41st Ave", "city": "Capitola", "state": "CA"},
    {"address": "7 Carmel Center Pl", "city": "Carmel", "state": "CA"},
    {"address": "27800 Dorris Dr", "city": "Carmel", "state": "CA"},
    {"address": "5049 Marconi Ave", "city": "Carmichael", "state": "CA"},
    {"address": "17255 Bloomfield Ave", "city": "Cerritos", "state": "CA"},
    {"address": "13356 E. South St", "city": "Cerritos", "state": "CA"},
    {"address": "11004 South St", "city": "Cerritos", "state": "CA"},
    {"address": "710 E Lassen Ave", "city": "Chico", "state": "CA"},
    {"address": "110 E Park Ave", "city": "Chico", "state": "CA"},
    {"address": "1255 W East Ave", "city": "Chico", "state": "CA"},
    {"address": "14088 Euclid Ave", "city": "Chino", "state": "CA"},
    {"address": "95 Bonita Rd", "city": "Chula Vista", "state": "CA"},
    {"address": "221 S Hacienda Blvd", "city": "City of Industry", "state": "CA"},
    {"address": "12589 E HIGHWAY 20", "city": "Clearlake Oaks", "state": "CA"},
    {"address": "2546 East Coast Hwy", "city": "Corona Del Mar", "state": "CA"},
    {"address": "1200 Northcrest Dr", "city": "Crescent City", "state": "CA"},
    {"address": "1006 US HIGHWAY 101 N", "city": "Crescent City", "state": "CA"},
    {"address": "900 US HIGHWAY 101 N", "city": "Crescent City", "state": "CA"},
    {"address": "9500 Valley View St", "city": "Cypress", "state": "CA"},
    {"address": "130 Pleasant Valley Rd", "city": "Diamond Springs", "state": "CA"},
    {"address": "8501 Bond Rd", "city": "Elk Grove", "state": "CA"},
    {"address": "9198 Elk Grove Florin Rd", "city": "Elk Grove", "state": "CA"},
    {"address": "2323 Laguna Blvd", "city": "Elk Grove", "state": "CA"},
    {"address": "1125 4th St", "city": "Eureka", "state": "CA"},
    {"address": "2111 4th St", "city": "Eureka", "state": "CA"},
    {"address": "1310 5th St", "city": "Eureka", "state": "CA"},
    {"address": "3505 Broadway St", "city": "Eureka", "state": "CA"},
    {"address": "1007 Broadway St", "city": "Eureka", "state": "CA"},
    {"address": "1434 Myrtle Avenue", "city": "Eureka", "state": "CA"},
    {"address": "111 W Harris St", "city": "Eureka", "state": "CA"},
    {"address": "3973 Walnut Dr", "city": "Eureka", "state": "CA"},
    {"address": "8900 Madison Ave", "city": "Fair Oaks", "state": "CA"},
    {"address": "5361 Sunrise Blvd", "city": "Fair Oaks", "state": "CA"},
    {"address": "4720 Gold Hill Rd", "city": "Fairfield", "state": "CA"},
    {"address": "119 Red Top Rd", "city": "Fairfield", "state": "CA"},
    {"address": "1024 E Bidwell St", "city": "Folsom", "state": "CA"},
    {"address": "9881 Greenback Ln", "city": "Folsom", "state": "CA"},
    {"address": "1020 Riley St", "city": "Folsom", "state": "CA"},
    {"address": "819 Main St", "city": "Fortuna", "state": "CA"},
    {"address": "1791 Riverwalk Dr", "city": "Fortuna", "state": "CA"},
    {"address": "390 S Fortuna Blvd", "city": "Fortuna", "state": "CA"},
    {"address": "723 S Fortuna Blvd", "city": "Fortuna", "state": "CA"},
    {"address": "36979 Fremont Blvd", "city": "Fremont", "state": "CA"},
    {"address": "2950 Nutwood Ave", "city": "Fullerton", "state": "CA"},
    {"address": "860 Redwood Dr", "city": "Garberville", "state": "CA"},
    {"address": "1080 Guadalupe St", "city": "Guadalupe", "state": "CA"},
    {"address": "604 S Coast Hwy", "city": "Laguna Beach", "state": "CA"},
    {"address": "25991 Crown Valley Pkwy", "city": "Laguna Niguel", "state": "CA"},
    {"address": "30072 Crown Valley Pkwy", "city": "Laguna Niguel", "state": "CA"},
    {"address": "1088 Lakeport Blvd", "city": "Lakeport", "state": "CA"},
    {"address": "2935 Lakeshore Blvd", "city": "Lakeport", "state": "CA"},
    {"address": "192 Lathrop Rd", "city": "Lathrop", "state": "CA"},
    {"address": "671 Lincoln Blvd", "city": "Lincoln", "state": "CA"},
    {"address": "2330 Nicolaus Rd", "city": "Lincoln", "state": "CA"},
    {"address": "9811 Live Oak Blvd", "city": "Live Oak", "state": "CA"},
    {"address": "14000 CA-88", "city": "Lockeford", "state": "CA"},
    {"address": "5100 Katella Ave", "city": "Los Alamitos", "state": "CA"},
    {"address": "11305 Culver Blvd", "city": "Los Angeles", "state": "CA"},
    {"address": "1516 Main St", "city": "Los Angeles", "state": "CA"},
    {"address": "10815 National Blvd", "city": "Los Angeles", "state": "CA"},
    {"address": "11852 San Vicente Blvd", "city": "Los Angeles", "state": "CA"},
    {"address": "9815 HIGHWAY 53", "city": "Lower Lake", "state": "CA"},
    {"address": "6282 E HIGHWAY 20", "city": "Lucerne", "state": "CA"},
    {"address": "1434 W Yosemite Ave", "city": "Manteca", "state": "CA"},
    {"address": "3030 Del Monte Blvd", "city": "Marina", "state": "CA"},
    {"address": "3012 Howe Rd", "city": "Martinez", "state": "CA"},
    {"address": "1606 Central Ave", "city": "McKinleyville", "state": "CA"},
    {"address": "1551 California Cir", "city": "Milpitas", "state": "CA"},
    {"address": "9700 Central Ave", "city": "Montclair", "state": "CA"},
    {"address": "1600 Paramount Blvd", "city": "Montebello", "state": "CA"},
    {"address": "7825 Telegraph Rd.", "city": "Montebello", "state": "CA"},
    {"address": "7501 Telegraph Rd.", "city": "Montebello", "state": "CA"},
    {"address": "3444 E Hwy 20", "city": "Nice", "state": "CA"},
    {"address": "3519 A St", "city": "North Highlands", "state": "CA"},
    {"address": "3475 Main St", "city": "Oakley", "state": "CA"},
    {"address": "656 Benet Rd", "city": "Oceanside", "state": "CA"},
    {"address": "3945 Mission Ave", "city": "Oceanside", "state": "CA"},
    {"address": "2191 Vista Way", "city": "Oceanside", "state": "CA"},
    {"address": "4217 Arboga Rd", "city": "Olivehurst", "state": "CA"},
    {"address": "1976 McGowan Pkwy", "city": "Olivehurst", "state": "CA"},
    {"address": "2970 Olive Hwy", "city": "Oroville", "state": "CA"},
    {"address": "687 Lighthouse Ave", "city": "Pacific Grove", "state": "CA"},
    {"address": "1440 E Washington St", "city": "Petaluma", "state": "CA"},
    {"address": "254 Bailey Rd", "city": "Pittsburg", "state": "CA"},
    {"address": "1805 Willow Pass Rd", "city": "Pittsburg", "state": "CA"},
    {"address": "1515 N Garey Ave", "city": "Pomona", "state": "CA"},
    {"address": "1903 W Holt Ave", "city": "Pomona", "state": "CA"},
    {"address": "3190 W Temple Ave", "city": "Pomona", "state": "CA"},
    {"address": "1670 Hartnell Ave", "city": "Redding", "state": "CA"},
    {"address": "1495 Lake Blvd", "city": "Redding", "state": "CA"},
    {"address": "3122 Redwood Dr", "city": "Redway", "state": "CA"},
    {"address": "582 Wildwood Ave", "city": "Rio Dell", "state": "CA"},
    {"address": "1050 Sunset Blvd", "city": "Rocklin", "state": "CA"},
    {"address": "1400 E Roseville Pkwy", "city": "Roseville", "state": "CA"},
    {"address": "10545 Fairway Dr", "city": "Roseville", "state": "CA"},
    {"address": "3001 Foothills Blvd", "city": "Roseville", "state": "CA"},
    {"address": "4231 Arden Wy", "city": "Sacramento", "state": "CA"},
    {"address": "4430 Auburn Blvd", "city": "Sacramento", "state": "CA"},
    {"address": "3300 Bradshaw Rd", "city": "Sacramento", "state": "CA"},
    {"address": "9680 Business Park Dr", "city": "Sacramento", "state": "CA"},
    {"address": "8908 Elder Creek Rd", "city": "Sacramento", "state": "CA"},
    {"address": "5597 Stockton Blvd", "city": "Sacramento", "state": "CA"},
    {"address": "458 E Market St.", "city": "Salinas", "state": "CA"},
    {"address": "1764 N Main St", "city": "Salinas", "state": "CA"},
    {"address": "417 N Main St", "city": "Salinas", "state": "CA"},
    {"address": "440 W St Charles St", "city": "San Andreas", "state": "CA"},
    {"address": "8210 Camino Santa Fe", "city": "San Diego", "state": "CA"},
    {"address": "2432 Coronado Ave", "city": "San Diego", "state": "CA"},
    {"address": "4180 Park Blvd", "city": "San Diego", "state": "CA"},
    {"address": "3800 3rd St", "city": "San Francisco", "state": "CA"},
    {"address": "545 W Alma Ave", "city": "San Jose", "state": "CA"},
    {"address": "220 Sycamore Rd", "city": "San Ysidro", "state": "CA"},
    {"address": "3501 Homestead Rd", "city": "Santa Clara", "state": "CA"},
    {"address": "2700 Soquel Ave", "city": "Santa Cruz", "state": "CA"},
    {"address": "1732 Lincoln Blvd", "city": "Santa Monica", "state": "CA"},
    {"address": "1330 Santa Monica Blvd", "city": "Santa Monica", "state": "CA"},
    {"address": "432 Wilshire Blvd", "city": "Santa Monica", "state": "CA"},
    {"address": "1300 Farmers Ln", "city": "Santa Rosa", "state": "CA"},
    {"address": "3825 Santa Rosa Ave", "city": "Santa Rosa", "state": "CA"},
    {"address": "1 Hacienda Dr", "city": "Scotts Valley", "state": "CA"},
    {"address": "90 Mt Hermon Rd", "city": "Scotts Valley", "state": "CA"},
    {"address": "1305 S Front St", "city": "Soledad", "state": "CA"},
    {"address": "1105 Santa Anita Ave", "city": "South El Monte", "state": "CA"},
    {"address": "2986 US Hwy 50", "city": "South Lake Tahoe", "state": "CA"},
    {"address": "4155 Suisun Valley Rd", "city": "Suisun City", "state": "CA"},
    {"address": "3940 N Tracy Blvd", "city": "Tracy", "state": "CA"},
    {"address": "12353 Deerfield Dr", "city": "Truckee", "state": "CA"},
    {"address": "10041 Donner Pass Rd", "city": "Truckee", "state": "CA"},
    {"address": "31300 Alvarado-Niles Rd", "city": "Union City", "state": "CA"},
    {"address": "501 Peabody Rd", "city": "Vacaville", "state": "CA"},
    {"address": "900 Mason St", "city": "Vacaville", "state": "CA"},
    {"address": "223 Fairgrounds Dr", "city": "Vallejo", "state": "CA"},
    {"address": "425 Laurel St", "city": "Vallejo", "state": "CA"},
    {"address": "251 Lincoln Blvd", "city": "Venice", "state": "CA"},
    {"address": "3180 Jefferson Blvd", "city": "West Sacramento", "state": "CA"},
    {"address": "901 East St", "city": "Woodland", "state": "CA"},
    {"address": "530 Bogue Rd", "city": "Yuba City", "state": "CA"},
    {"address": "790 Tahoe Blvd", "city": "Incline Village", "state": "NV"},
    {"address": "2500 HIGHWAY 66", "city": "Ashland", "state": "OR"},
    {"address": "13982 NW Main St", "city": "Banks", "state": "OR"},
    {"address": "24485 HIGHWAY 101 S", "city": "Beaver", "state": "OR"},
    {"address": "22025 S Beavercreek Rd", "city": "Beavercreek", "state": "OR"},
    {"address": "3405 N Hwy 97", "city": "Bend", "state": "OR"},
    {"address": "2409 NE Butler Market Rd", "city": "Bend", "state": "OR"},
    {"address": "2100 NE Hwy 20", "city": "Bend", "state": "OR"},
    {"address": "1400 NW College Way", "city": "Bend", "state": "OR"},
    {"address": "981 NW Galveston Ave.", "city": "Bend", "state": "OR"},
    {"address": "1123 Chetco Ave", "city": "Brookings", "state": "OR"},
    {"address": "16258 U.S. 101", "city": "Brookings", "state": "OR"},
    {"address": "262 SE 1st Ave", "city": "Canby", "state": "OR"},
    {"address": "112 Redwood Hwy", "city": "Cave Junction", "state": "OR"},
    {"address": "1510 E Pine St", "city": "Central Point", "state": "OR"},
    {"address": "1065 E Pine St", "city": "Central Point", "state": "OR"},
    {"address": "6779 CRATER LAKE HIGHWAY", "city": "Central Point", "state": "OR"},
    {"address": "10596 SE Hwy 212", "city": "Clackamas", "state": "OR"},
    {"address": "55870 NW Wilson River Hwy", "city": "Gales Creek", "state": "OR"},
    {"address": "701 Garibaldi Ave", "city": "Garibaldi", "state": "OR"},
    {"address": "19805 McLoughlin Blvd", "city": "Gladstone", "state": "OR"},
    {"address": "1995 NE 6th St", "city": "Grants Pass", "state": "OR"},
    {"address": "836 NE A St", "city": "Grants Pass", "state": "OR"},
    {"address": "125 NE Morgan Ln", "city": "Grants Pass", "state": "OR"},
    {"address": "104 NE Morgan Ln", "city": "Grants Pass", "state": "OR"},
    {"address": "1044 NW 6th St", "city": "Grants Pass", "state": "OR"},
    {"address": "650 Redwood Hwy", "city": "Grants Pass", "state": "OR"},
    {"address": "1553 Williams Hwy", "city": "Grants Pass", "state": "OR"},
    {"address": "6410 Williams Hwy", "city": "Grants Pass", "state": "OR"},
    {"address": "945 N 5th St", "city": "Jacksonville", "state": "OR"},
    {"address": "2123 Oregon Ave", "city": "Klamath Falls", "state": "OR"},
    {"address": "3434 S 6th St", "city": "Klamath Falls", "state": "OR"},
    {"address": "2104 SE 6th St.", "city": "Klamath Falls", "state": "OR"},
    {"address": "52530 Hwy 97", "city": "La Pine", "state": "OR"},
    {"address": "1210 SW Hwy 97", "city": "Madras", "state": "OR"},
    {"address": "2232 Biddle Rd", "city": "Medford", "state": "OR"},
    {"address": "1325 Court St", "city": "Medford", "state": "OR"},
    {"address": "417 E Barnett Rd", "city": "Medford", "state": "OR"},
    {"address": "1068 S Riverside Ave", "city": "Medford", "state": "OR"},
    {"address": "1306 Springbrook Rd", "city": "Medford", "state": "OR"},
    {"address": "785 Stewart Ave", "city": "Medford", "state": "OR"},
    {"address": "3046 SE Harrison St", "city": "Milwaukie", "state": "OR"},
    {"address": "13939 SE McLoughlin Blvd", "city": "Milwaukie", "state": "OR"},
    {"address": "36453 N Hwy 101", "city": "Nehalem", "state": "OR"},
    {"address": "13001 Clackamas River Dr", "city": "Oregon City", "state": "OR"},
    {"address": "1511 Molalla Ave", "city": "Oregon City", "state": "OR"},
    {"address": "34995 Brooten Rd.", "city": "Pacific City", "state": "OR"},
    {"address": "730 W Main St", "city": "Phoenix", "state": "OR"},
    {"address": "1137 Oregon St", "city": "Port Orford", "state": "OR"},
    {"address": "914 Oregon St", "city": "Port Orford", "state": "OR"},
    {"address": "398 NW 3rd St", "city": "Prineville", "state": "OR"},
    {"address": "2005 S Hwy 97", "city": "Redmond", "state": "OR"},
    {"address": "125 Depot St", "city": "Rogue River", "state": "OR"},
    {"address": "95 Pine St", "city": "Rogue River", "state": "OR"},
    {"address": "345 W Harvard Ave", "city": "Roseburg", "state": "OR"},
    {"address": "18430 Redwood Hwy", "city": "Selma", "state": "OR"},
    {"address": "21222 HIGHWAY 62", "city": "Shady Cove", "state": "OR"},
    {"address": "56896 Venture Ln", "city": "Sunriver", "state": "OR"},
    {"address": "21 Talent Ave", "city": "Talent", "state": "OR"},
    {"address": "301 W Valley View Rd", "city": "Talent", "state": "OR"},
    {"address": "8160 US-97", "city": "Terrebonne", "state": "OR"},
    {"address": "303 Pacific Ave", "city": "Tillamook", "state": "OR"},
    {"address": "7640 HIGHWAY 62", "city": "White City", "state": "OR"},
    {"address": "692 NE Main St", "city": "Willamina", "state": "OR"},
]

KWIK_TRIP_WI_LOCATIONS = [
    {"address": "2929 Meadowlark Ln", "city": "Altoona", "state": "WI"},
    {"address": "116 Baumbach Way", "city": "Altoona", "state": "WI"},
    {"address": "855 Keller Ave S", "city": "Amery", "state": "WI"},
    {"address": "455 State Hwy 64", "city": "Antigo", "state": "WI"},
    {"address": "831 S Superior St", "city": "Antigo", "state": "WI"},
    {"address": "650 W Northland Ave", "city": "Appleton", "state": "WI"},
    {"address": "2120 E Edgewood Dr", "city": "Appleton", "state": "WI"},
    {"address": "4520 W Greenville Dr", "city": "Appleton", "state": "WI"},
    {"address": "515 Ellis Ave", "city": "Ashland", "state": "WI"},
    {"address": "2300 Lakeshore Dr E", "city": "Ashland", "state": "WI"},
    {"address": "1814 Lakeshore Dr W", "city": "Ashland", "state": "WI"},
    {"address": "2282 S Ridge Rd", "city": "Ashwaubenon", "state": "WI"},
    {"address": "2499 S Point Rd", "city": "Ashwaubenon", "state": "WI"},
    {"address": "950 Curtis St", "city": "Baldwin", "state": "WI"},
    {"address": "1171 Wisconsin Dells Pkwy S", "city": "Baraboo", "state": "WI"},
    {"address": "100 E Industrial Dr", "city": "Barneveld", "state": "WI"},
    {"address": "1456 E Laa Salle Ave", "city": "Barron", "state": "WI"},
    {"address": "2006 N Spring St", "city": "Beaver Dam", "state": "WI"},
    {"address": "1201 Madison St", "city": "Beaver Dam", "state": "WI"},
    {"address": "1120 Bellwest Blvd", "city": "Belleville", "state": "WI"},
    {"address": "106 N Royal Ave", "city": "Belgium", "state": "WI"},
    {"address": "3155 Prairie Ave", "city": "Beloit", "state": "WI"},
    {"address": "2107 1st Center Ave", "city": "Brodhead", "state": "WI"},
    {"address": "500 Falcon Ridge Dr", "city": "Burlington", "state": "WI"},
    {"address": "1164 Pine St S", "city": "Burlington", "state": "WI"},
    {"address": "424 W Main St", "city": "Cambridge", "state": "WI"},
    {"address": "550 Westgate Ct", "city": "Cambridge", "state": "WI"},
    {"address": "201 S 1st St", "city": "Cameron", "state": "WI"},
    {"address": "1267 Chippewa Crossing Blvd", "city": "Chippewa Falls", "state": "WI"},
    {"address": "12 W Madison St", "city": "Clintonville", "state": "WI"},
    {"address": "204 Dix St", "city": "Columbus", "state": "WI"},
    {"address": "459 Debruin Rd", "city": "Combined Locks", "state": "WI"},
    {"address": "1601 Landmark Dr", "city": "Cottage Grove", "state": "WI"},
    {"address": "401 W Cottage Grove Rd", "city": "Cottage Grove", "state": "WI"},
    {"address": "212 US Highway 141", "city": "Crtiviz", "state": "WI"},
    {"address": "7372 N Towne Rd", "city": "DeForest", "state": "WI"},
    {"address": "4848 Cty Hwy V", "city": "DeForest", "state": "WI"},
    {"address": "4665 Dalmore Rd", "city": "DeForest", "state": "WI"},
    {"address": "111 Bohemia Dr", "city": "Denmark", "state": "WI"},
    {"address": "2618 Monroe Rd", "city": "DePere", "state": "WI"},
    {"address": "1122 N Bequette St", "city": "Dodgeville", "state": "WI"},
    {"address": "1101 Hardy St", "city": "Durand", "state": "WI"},
    {"address": "201 W Wall St", "city": "Eagle River", "state": "WI"},
    {"address": "1506 Black Ave", "city": "Eau Claire", "state": "WI"},
    {"address": "2327 N Clairemont Ave", "city": "Eau Claire", "state": "WI"},
    {"address": "2232 Otter Rd", "city": "Eau Claire", "state": "WI"},
    {"address": "2715 Golf Rd", "city": "Eau Claire", "state": "WI"},
    {"address": "3801 Gateway Dr", "city": "Eau Claire", "state": "WI"},
    {"address": "1130 W McCarthur Ave", "city": "Eau Claire", "state": "WI"},
    {"address": "6 W Hidden Trail", "city": "Elkhorn", "state": "WI"},
    {"address": "6133 McKee Rd", "city": "Fitchburg", "state": "WI"},
    {"address": "2792 S Syene Rd", "city": "Fitchburg", "state": "WI"},
    {"address": "1061 E Johnson St", "city": "Fond du Lac", "state": "WI"},
    {"address": "1123 W Johnson St", "city": "Fond du Lac", "state": "WI"},
    {"address": "665 W Scott", "city": "Fond du Lac", "state": "WI"},
    {"address": "456 S Main St", "city": "Fond du Lac", "state": "WI"},
    {"address": "168 N Pioneer Rd", "city": "Fond du Lac", "state": "WI"},
    {"address": "1565 Madison Ave", "city": "Fort Atkinson", "state": "WI"},
    {"address": "1680 Janesville Ave", "city": "Fort Atkinson", "state": "WI"},
    {"address": "10750 W Speedway Dr", "city": "Franklin", "state": "WI"},
    {"address": "5040 W Rawson Ave", "city": "Franklin", "state": "WI"},
    {"address": "W188 N10963 Maple Rd", "city": "Germantown", "state": "WI"},
    {"address": "3721 W College Ave", "city": "Grand Chute", "state": "WI"},
    {"address": "710 W Evergreen Dr", "city": "Grand Chute", "state": "WI"},
    {"address": "650 W Northland Ave", "city": "Grand Chute", "state": "WI"},
    {"address": "1712 E Mason St", "city": "Green Bay", "state": "WI"},
    {"address": "840 S Huron Rd", "city": "Green Bay", "state": "WI"},
    {"address": "2400 University Ave", "city": "Green Bay", "state": "WI"},
    {"address": "2498 Lineville Rd", "city": "Green Bay", "state": "WI"},
    {"address": "2203 S Webster Ave", "city": "Green Bay", "state": "WI"},
    {"address": "3525 Humboldt Rd", "city": "Green Bay", "state": "WI"},
    {"address": "1712 E Mason St", "city": "Green Bay", "state": "WI"},
    {"address": "715 W Capitol Dr", "city": "Hartland", "state": "WI"},
    {"address": "15870 US Hwy 63", "city": "Hayward", "state": "WI"},
    {"address": "115 Hale Dr", "city": "Holmen", "state": "WI"},
    {"address": "1760 Temte St", "city": "Holmen", "state": "WI"},
    {"address": "261 E Main St", "city": "Hortonville", "state": "WI"},
    {"address": "399 Cardinal Ln", "city": "Howard", "state": "WI"},
    {"address": "2401 Crest View Dr", "city": "Hudson", "state": "WI"},
    {"address": "520 Annabelle Way", "city": "Hudson", "state": "WI"},
    {"address": "3123 S US Hwy 51", "city": "Janesville", "state": "WI"},
    {"address": "2810 E Milwaukee St", "city": "Janesville", "state": "WI"},
    {"address": "1919 Humes Rd", "city": "Janesville", "state": "WI"},
    {"address": "1100 N Wright Rd", "city": "Janesville", "state": "WI"},
    {"address": "102 Collins Rd", "city": "Jefferson", "state": "WI"},
    {"address": "1080 Remmel Dr", "city": "Johnson Creek", "state": "WI"},
    {"address": "322 Lawe St", "city": "Kaukauna", "state": "WI"},
    {"address": "6300 52nd St", "city": "Kenosha", "state": "WI"},
    {"address": "11350 28th St", "city": "Kenosha", "state": "WI"},
    {"address": "701 Schelfhout Ln", "city": "Kimberly", "state": "WI"},
    {"address": "4828 Mormon Coulee Rd", "city": "La Crosse", "state": "WI"},
    {"address": "506 Cass St", "city": "La Crosse", "state": "WI"},
    {"address": "1922 Ward Ave", "city": "La Crosse", "state": "WI"},
    {"address": "1125 George St W", "city": "La Crosse", "state": "WI"},
    {"address": "100 W 9th St N", "city": "Ladysmith", "state": "WI"},
    {"address": "710 Williams St", "city": "Lake Geneva", "state": "WI"},
    {"address": "230 S Main St", "city": "Lodi", "state": "WI"},
    {"address": "3602 Milwaukee St", "city": "Madison", "state": "WI"},
    {"address": "5440 E Broadway", "city": "Madison", "state": "WI"},
    {"address": "8201 Watts Rd", "city": "Madison", "state": "WI"},
    {"address": "7602 Tree Ln", "city": "Madison", "state": "WI"},
    {"address": "725 N High Point Rd", "city": "Madison", "state": "WI"},
    {"address": "4402 Calumet Ave", "city": "Manitowoc", "state": "WI"},
    {"address": "1801 Marinette Ave", "city": "Marinette", "state": "WI"},
    {"address": "450 N Hubbell Ave", "city": "Marshall", "state": "WI"},
    {"address": "825 N 8th St", "city": "Medford", "state": "WI"},
    {"address": "625 Midway Rd", "city": "Menasha", "state": "WI"},
    {"address": "W156 N8481 Pilgrims Rd", "city": "Menomonee Falls", "state": "WI"},
    {"address": "2219 Stout Rd", "city": "Menomonie", "state": "WI"},
    {"address": "7400 Erin St", "city": "Middleton", "state": "WI"},
    {"address": "720 Oneida St", "city": "Minocqua", "state": "WI"},
    {"address": "2900 Winnebago St", "city": "Monona", "state": "WI"},
    {"address": "901 8th St", "city": "Monroe", "state": "WI"},
    {"address": "100 Springdale St", "city": "Mt. Horeb", "state": "WI"},
    {"address": "1260 East Veterans Way", "city": "Mukwonago", "state": "WI"},
    {"address": "S65 W17700 Martin Dr", "city": "Muskego", "state": "WI"},
    {"address": "701 S Green Bay Rd", "city": "Neenah", "state": "WI"},
    {"address": "1200 W Wisconsin Ave", "city": "Neenah", "state": "WI"},
    {"address": "4100 S Moorland Rd", "city": "New Berlin", "state": "WI"},
    {"address": "2100 Plymouth Rd", "city": "New Holstein", "state": "WI"},
    {"address": "920 W Washington St", "city": "New London", "state": "WI"},
    {"address": "1430 Paperjack Dr", "city": "New Richmond", "state": "WI"},
    {"address": "7750 S Howell Ave", "city": "Oak Creek", "state": "WI"},
    {"address": "1125 E Main St", "city": "Omro", "state": "WI"},
    {"address": "2704 E Oak Ave", "city": "Onalaska", "state": "WI"},
    {"address": "1130 N Main St", "city": "Oregon", "state": "WI"},
    {"address": "3000 W 9th Ave", "city": "Oshkosh", "state": "WI"},
    {"address": "3105 S Washburn St", "city": "Oshkosh", "state": "WI"},
    {"address": "1025 N Westhaven Dr", "city": "Oshkosh", "state": "WI"},
    {"address": "N4650 US Hwy 151", "city": "Perry/Randolph", "state": "WI"},
    {"address": "1020 Lake Ave", "city": "Phillips", "state": "WI"},
    {"address": "3400 N Point Dr", "city": "Plover", "state": "WI"},
    {"address": "826 Eastern Ave", "city": "Plymouth", "state": "WI"},
    {"address": "2703 New Pinery Rd", "city": "Portage", "state": "WI"},
    {"address": "930 Water St", "city": "Prairie du Sac", "state": "WI"},
    {"address": "425 Industrial Park Dr", "city": "Prescott", "state": "WI"},
    {"address": "2610 S Main St", "city": "Rice Lake", "state": "WI"},
    {"address": "1501 N Main St", "city": "River Falls", "state": "WI"},
    {"address": "1021 E Green Bay St", "city": "Shawano", "state": "WI"},
    {"address": "3130 S Business Dr", "city": "Sheboygan", "state": "WI"},
    {"address": "W242 Hillcrest Dr", "city": "Slinger", "state": "WI"},
    {"address": "124 Crossroads Dr", "city": "Somerset", "state": "WI"},
    {"address": "1225 W College Ave", "city": "South Milwaukee", "state": "WI"},
    {"address": "24150 US 63", "city": "Spooner", "state": "WI"},
    {"address": "5004 Main St", "city": "Stevens Point", "state": "WI"},
    {"address": "2351 US Hwy 51 N", "city": "Stoughton", "state": "WI"},
    {"address": "2801 Caledonia Rd", "city": "Sturtevant", "state": "WI"},
    {"address": "1281 Lakeview Dr", "city": "Suamico", "state": "WI"},
    {"address": "400 W Main St", "city": "Sun Prairie", "state": "WI"},
    {"address": "2410 W Main St", "city": "Sun Prairie", "state": "WI"},
    {"address": "3302 Tower Ave", "city": "Superior", "state": "WI"},
    {"address": "N64 W22655 Main St", "city": "Sussex", "state": "WI"},
    {"address": "W229 N1400 Westwood Dr", "city": "Sussex", "state": "WI"},
    {"address": "N3485 Hwy 13", "city": "Toledo", "state": "WI"},
    {"address": "406 US Hwy 8", "city": "Turtle Lake", "state": "WI"},
    {"address": "4520 Memorial Dr", "city": "Two Rivers", "state": "WI"},
    {"address": "802 S Main St", "city": "Verona", "state": "WI"},
    {"address": "1200 Blackhawk Dr", "city": "Viroqua", "state": "WI"},
    {"address": "1300 S Church St", "city": "Watertown", "state": "WI"},
    {"address": "1600 E Moreland Blvd", "city": "Waukesha", "state": "WI"},
    {"address": "1201 Royalton St", "city": "Waupaca", "state": "WI"},
    {"address": "4400 Rib Mountain Dr", "city": "Wausau", "state": "WI"},
    {"address": "105 Prairie View Dr", "city": "Waunakee", "state": "WI"},
    {"address": "621 W Main St", "city": "Waupun", "state": "WI"},
    {"address": "2990 W Washington St", "city": "West Bend", "state": "WI"},
    {"address": "2295 US Hwy 16", "city": "West Salem", "state": "WI"},
    {"address": "4015 Rib Mountain Dr", "city": "Weston", "state": "WI"},
    {"address": "715 W Main St", "city": "Whitewater", "state": "WI"},
    {"address": "1700 N Second St", "city": "Winneconne", "state": "WI"},
    {"address": "1010 Broadway", "city": "Wisconsin Dells", "state": "WI"},
    {"address": "3060 8th St S", "city": "Wisconsin Rapids", "state": "WI"},
    {"address": "2191 8th St S", "city": "Wisconsin Rapids", "state": "WI"},
]

ALL_SOURCES = [
    {"name": "Holiday Stationstores", "verified_by": "Holiday Stationstores official car wash locations page (circlek.com)", "locations": HOLIDAY_LOCATIONS},
    {"name": "Power Market", "verified_by": "Power Market official touchless drive-through locations page (pwrmarket.com)", "locations": POWER_MARKET_LOCATIONS},
    {"name": "Kwik Trip", "verified_by": "Kwik Trip official Car Wash List PDF (kwiktrip.com/wordpress/wp-content/uploads/2025/02/Car-Wash-List-and-Map.pdf) — Touch Free (TF) labeled locations in WI", "locations": KWIK_TRIP_WI_LOCATIONS},
]

# ── Logging ───────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

# ── Progress ──────────────────────────────────────────────────────────────────

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'processed': [], 'inserted': [], 'updated': [], 'skipped': [], 'errors': []}

def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f, indent=2)

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def dfs_post(path, body):
    req = urllib.request.Request(
        f'https://api.dataforseo.com{path}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Basic {DATAFORSEO_KEY}'}
    )
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as r:
        return json.loads(r.read())

def sb_req(method, path, body=None, extra_headers=None):
    headers = {
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=json.dumps(body).encode() if body else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as r:
        return json.loads(r.read())

def edge_post(func, body):
    req = urllib.request.Request(
        f'{EDGE_BASE}/{func}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {SUPABASE_ANON}'}
    )
    with urllib.request.urlopen(req, timeout=150, context=ssl_ctx) as r:
        return json.loads(r.read())

# ── Slug helpers ──────────────────────────────────────────────────────────────

def slugify(text):
    s = text.lower()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return re.sub(r'-+', '-', s).strip('-')

def make_unique_slug(name, existing_slugs):
    base = slugify(name)
    candidate, attempt = base, 0
    while candidate in existing_slugs:
        attempt += 1
        candidate = f'{base}-{attempt}'
    existing_slugs.add(candidate)
    return candidate

# ── DataForSEO helpers ────────────────────────────────────────────────────────

STATE_NAMES = {
    'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
    'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
    'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
    'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
    'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri',
    'MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey',
    'NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio',
    'OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
    'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont',
    'VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming',
    'DC':'District of Columbia',
}

def parse_hours(work_hours):
    if not work_hours:
        return {}
    hours = {}
    timetable = work_hours.get('timetable') or {}
    day_map = {'sunday':'Sunday','monday':'Monday','tuesday':'Tuesday','wednesday':'Wednesday',
               'thursday':'Thursday','friday':'Friday','saturday':'Saturday'}
    for dk, dl in day_map.items():
        slots = timetable.get(dk)
        if slots is None:
            hours[dl] = 'Closed'
        elif slots == []:
            hours[dl] = 'Open 24 hours'
        else:
            parts = []
            for s in slots:
                oh = f"{s.get('open',{}).get('hour',0):02d}:{s.get('open',{}).get('minute',0):02d}"
                ch = f"{s.get('close',{}).get('hour',0):02d}:{s.get('close',{}).get('minute',0):02d}"
                parts.append(f'{oh}–{ch}')
            hours[dl] = ', '.join(parts)
    return hours

def lookup_location(chain_name, address, city, state):
    """
    Use DataForSEO my_business_info/live to find a business by address.
    Returns enriched dict or None.
    """
    keyword = f'{chain_name} {address} {city} {state}'
    r = dfs_post('/v3/business_data/google/my_business_info/live', [{
        'keyword': keyword,
        'location_name': 'United States',
        'language_code': 'en',
    }])
    task = r['tasks'][0]
    if task.get('status_code') != 20000:
        raise Exception(f"DFS {task.get('status_code')}: {task.get('status_message')}")
    result = task.get('result')
    if not result or not result[0].get('items'):
        return None
    item = result[0]['items'][0]

    title = item.get('title') or ''
    addr_info = item.get('address_info') or {}
    found_city = addr_info.get('city') or addr_info.get('borough') or ''
    found_state = addr_info.get('region') or ''
    # Abbreviate state if full name returned
    if len(found_state) > 2:
        rev = {v: k for k, v in STATE_NAMES.items()}
        found_state = rev.get(found_state, found_state[:2].upper())

    # Sanity check: result should be in the same city/state
    if found_state.upper() != state.upper():
        return None

    pid = item.get('place_id') or None
    # Try to extract place_id from local_business_links
    if not pid:
        for link in (item.get('local_business_links') or []):
            m = re.search(r'place_id:([A-Za-z0-9_-]+)', link.get('url', ''))
            if m:
                pid = m.group(1)
                break

    phone = item.get('phone') or None
    website = item.get('url') or None
    rating = (item.get('rating') or {}).get('value') or 0
    review_count = (item.get('rating') or {}).get('votes_count') or 0
    lat = (item.get('coordinates') or {}).get('latitude')
    lng = (item.get('coordinates') or {}).get('longitude')
    description = item.get('description') or None
    category = item.get('category') or None
    zip_ = addr_info.get('zip') or ''
    street = (item.get('address') or address).split(',')[0].strip()
    hours = parse_hours(item.get('work_hours'))
    main_image = upscale_google_photo(item.get('main_image') or None)
    price_level = item.get('price_level')
    price_range = {1:'$',2:'$$',3:'$$$',4:'$$$$'}.get(price_level)

    google_maps_url = None
    for link in (item.get('local_business_links') or []):
        if 'google.com/maps' in (link.get('url') or ''):
            google_maps_url = link['url']
            break
    if not google_maps_url and pid:
        google_maps_url = f'https://www.google.com/maps/place/?q=place_id:{pid}'

    return {
        'name': title or chain_name,
        'address': street,
        'city': found_city or city,
        'state': found_state or state,
        'zip': zip_,
        'phone': phone,
        'website': website,
        'rating': float(rating) if rating else 0,
        'review_count': int(review_count) if review_count else 0,
        'latitude': float(lat) if lat else None,
        'longitude': float(lng) if lng else None,
        'google_description': description,
        'google_category': category,
        'google_maps_url': google_maps_url,
        'google_place_id': pid,
        'hours': hours,
        'main_image': main_image,
        'price_range': price_range,
    }

# ── Main import ───────────────────────────────────────────────────────────────

def main():
    log('=' * 60)
    log('Chain location import: Holiday Stationstores + Power Market')
    log('=' * 60)

    progress = load_progress()
    processed_set = set(progress['processed'])

    # Load existing slugs
    log('Loading existing slugs...')
    existing_slugs = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=slug&limit=1000&offset={offset}')
        for r in rows:
            if r.get('slug'):
                existing_slugs.add(r['slug'])
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_slugs)} existing slugs')

    # Load existing addresses for dedup
    log('Loading existing addresses...')
    existing_addresses = set()
    offset = 0
    while True:
        rows = sb_req('GET', f'/rest/v1/listings?select=address,city,state&limit=1000&offset={offset}')
        for r in rows:
            if r.get('address') and r.get('city') and r.get('state'):
                key = f"{r['address'].lower().strip()}|{r['city'].lower().strip()}|{r['state'].upper().strip()}"
                existing_addresses.add(key)
        if len(rows) < 1000:
            break
        offset += 1000
    log(f'Loaded {len(existing_addresses)} existing address records')

    total_inserted = 0
    total_skipped = 0
    total_errors = 0

    for source in ALL_SOURCES:
        chain_name = source['name']
        verified_by = source['verified_by']
        locations = source['locations']

        log(f'\n--- {chain_name}: {len(locations)} confirmed touchless locations ---')
        inserted = skipped = errors = 0

        for i, loc in enumerate(locations):
            key = f"{loc['address'].lower().strip()}|{loc['city'].lower().strip()}|{loc['state'].upper().strip()}"
            prog_key = f"{chain_name}|{key}"

            if prog_key in processed_set:
                skipped += 1
                continue

            # Check if already in DB by address
            if key in existing_addresses:
                log(f'  SKIP (in DB): {loc["address"]}, {loc["city"]}, {loc["state"]}')
                skipped += 1
                progress['processed'].append(prog_key)
                progress['skipped'].append({'chain': chain_name, 'address': loc['address'], 'city': loc['city'], 'state': loc['state'], 'reason': 'address_in_db'})
                processed_set.add(prog_key)
                continue

            # Look up via DataForSEO
            try:
                data = lookup_location(chain_name, loc['address'], loc['city'], loc['state'])
            except Exception as e:
                errors += 1
                log(f'  ERROR {loc["address"]}, {loc["city"]}, {loc["state"]}: {e}')
                progress['processed'].append(prog_key)
                progress['errors'].append({'chain': chain_name, 'address': loc['address'], 'city': loc['city'], 'state': loc['state'], 'error': str(e)})
                processed_set.add(prog_key)
                if errors % 10 == 0:
                    save_progress(progress)
                time.sleep(1)
                continue

            if data is None:
                log(f'  NOT FOUND: {loc["address"]}, {loc["city"]}, {loc["state"]}')
                skipped += 1
                progress['processed'].append(prog_key)
                progress['skipped'].append({'chain': chain_name, 'address': loc['address'], 'reason': 'not_found_in_dataforseo'})
                processed_set.add(prog_key)
                time.sleep(0.15)
                continue

            # Check place_id dedup
            if data.get('google_place_id'):
                try:
                    existing = sb_req('GET', f'/rest/v1/listings?google_place_id=eq.{data["google_place_id"]}&select=id,is_touchless,touchless_verified')
                    if existing:
                        ex = existing[0]
                        if ex.get('is_touchless') and ex.get('touchless_verified'):
                            # Already fully classified — skip
                            skipped += 1
                            progress['processed'].append(prog_key)
                            progress['skipped'].append({'chain': chain_name, 'address': loc['address'], 'reason': 'place_id_in_db_classified'})
                            processed_set.add(prog_key)
                            existing_addresses.add(key)
                            time.sleep(0.15)
                            continue
                        else:
                            # Exists but not properly classified — update it
                            sb_req('PATCH', f'/rest/v1/listings?id=eq.{ex["id"]}', {
                                'is_touchless': True,
                                'is_approved': True,
                                'touchless_verified': 'chain',
                                'crawl_notes': f'Confirmed touchless by {verified_by}',
                            })
                            log(f'  UPDATED: {data["name"]} — {data["city"]}, {data["state"]}')
                            progress['processed'].append(prog_key)
                            progress['updated'].append({'chain': chain_name, 'id': ex['id'], 'name': data['name']})
                            processed_set.add(prog_key)
                            existing_addresses.add(key)
                            time.sleep(0.15)
                            continue
                except Exception:
                    pass

            # Build slug and insert
            slug = make_unique_slug(data['name'], existing_slugs)
            listing = {
                'name':               data['name'],
                'slug':               slug,
                'address':            data['address'],
                'city':               data['city'],
                'state':              data['state'],
                'zip':                data['zip'] or '',
                'phone':              data['phone'],
                'website':            data['website'],
                'rating':             data['rating'],
                'review_count':       data['review_count'],
                'latitude':           data['latitude'],
                'longitude':          data['longitude'],
                'google_description': data['google_description'],
                'google_category':    data['google_category'],
                'google_maps_url':    data['google_maps_url'],
                'google_place_id':    data['google_place_id'],
                'hero_image':         data['main_image'],
                'google_photo_url':   data['main_image'],
                'photos':             [data['main_image']] if data['main_image'] else [],
                'hours':              data['hours'] or {},
                'wash_packages':      [],
                'amenities':          [],
                'price_range':        data['price_range'],
                'is_touchless':       True,
                'is_approved':        True,
                'is_featured':        False,
                'touchless_verified': 'chain',
                'parent_chain':       chain_name,
                'review_mine_status': None,   # queue for snippet mining
                'crawl_status':       'classified',
                'crawl_notes':        f'Confirmed touchless by {verified_by}',
            }

            try:
                result = sb_req('POST', '/rest/v1/listings', listing)
                inserted += 1
                total_inserted += 1
                inserted_id = result[0]['id'] if result else None
                log(f'  ✓ {data["name"]} — {data["city"]}, {data["state"]}')
                progress['processed'].append(prog_key)
                progress['inserted'].append({'chain': chain_name, 'id': inserted_id, 'name': data['name'], 'city': data['city'], 'state': data['state']})
                processed_set.add(prog_key)
                existing_addresses.add(key)
            except Exception as e:
                errors += 1
                total_errors += 1
                log(f'  INSERT ERROR {data["name"]}: {e}')
                progress['errors'].append({'chain': chain_name, 'address': loc['address'], 'error': f'insert: {e}'})
                progress['processed'].append(prog_key)
                processed_set.add(prog_key)

            if (i + 1) % 25 == 0:
                log(f'  Progress: {i+1}/{len(locations)} | inserted={inserted} skipped={skipped} errors={errors}')
                save_progress(progress)

            time.sleep(0.15)

        log(f'{chain_name} complete: {inserted} inserted | {skipped} skipped | {errors} errors')
        total_skipped += skipped
        total_errors += errors
        save_progress(progress)

    # Phase 2: Review mining for snippets
    log('\n--- Phase 2: Review mining for new chain listings ---')
    log('(Reviews confirm quality; is_touchless will NOT be reverted — chain source is authoritative)')

    batch = 0
    total_scanned = 0
    total_snippets = 0
    start = time.time()

    while True:
        try:
            r = edge_post('review-mine', {
                'action': 'scan_batch',
                'batch_size': 50,
                'all_listings': True,
            })
            scanned   = r.get('scanned_this_batch', 0)
            touchless = r.get('found_touchless', 0)
            complete  = r.get('complete', False)
            batch += 1
            total_scanned   += scanned
            total_snippets  += touchless

            elapsed = int(time.time() - start)
            log(f'Batch {batch}: scanned={scanned} with_snippets={touchless} ({elapsed}s)')

            if complete or scanned == 0:
                log('Review mining complete.')
                break

            time.sleep(3)
        except Exception as e:
            log(f'Mining error: {e}')
            time.sleep(10)

    # Final summary
    log('')
    log('=' * 60)
    log('CHAIN IMPORT COMPLETE')
    log(f'  Inserted:       {total_inserted}')
    log(f'  Skipped:        {total_skipped}')
    log(f'  Errors:         {total_errors}')
    log(f'  Mining batches: {batch} ({total_scanned} scanned, {total_snippets} got snippets)')
    log('=' * 60)


if __name__ == '__main__':
    main()
