/* Wildside Zoo: game data. No DOM here so it can run in tests. */
(function (root) {
  const D = {};
  D.WPY = 48;          // weeks per year (12 months of 4 weeks)
  D.RUN_YEARS = 20;    // a scored run lasts this many years

  // Biomes double as expedition regions.
  D.BIOMES = {
    savanna:  { name: 'Savanna',     region: 'East African Savanna', color: '#c8a24a', hab: 5000,    diff: 32,  exp: 3000,    weeks: 5,  rp: 0 },
    jungle:   { name: 'Rainforest',  region: 'Amazon Rainforest',    color: '#4a9462', hab: 20000,   diff: 70,  exp: 10000,   weeks: 6,  rp: 30 },
    desert:   { name: 'Outback',     region: 'Australian Outback',   color: '#c9794a', hab: 45000,   diff: 100, exp: 25000,   weeks: 6,  rp: 80 },
    arctic:   { name: 'Polar',       region: 'Polar Seas',           color: '#74b3d6', hab: 150000,  diff: 150, exp: 70000,   weeks: 8,  rp: 250 },
    mountain: { name: 'Highland',    region: 'Himalayan Highlands',  color: '#8b90ab', hab: 400000,  diff: 200, exp: 180000,  weeks: 8,  rp: 600 },
    ocean:    { name: 'Reef',        region: 'Coral Sea',            color: '#3a84bd', hab: 1000000, diff: 260, exp: 450000,  weeks: 9,  rp: 1400 },
    paleo:    { name: 'Lost Valley', region: 'The Lost Valley',      color: '#8a7a3c', hab: 3000000, diff: 330, exp: 1200000, weeks: 10, rp: 0, secret: true },
    mythic:   { name: 'Misty Isles', region: 'The Misty Isles',      color: '#9b6fcb', hab: 8000000, diff: 400, exp: 3000000, weeks: 10, rp: 0, secret: true }
  };
  D.BIOME_ORDER = ['savanna', 'jungle', 'desert', 'arctic', 'mountain', 'ocean', 'paleo', 'mythic'];

  // [id, name, biome, rarity 1-6, rare variant name]
  const SP = [
    ['warthog', 'Warthog', 'savanna', 1, 'Red'], ['zebra', 'Zebra', 'savanna', 1, 'Golden'], ['ostrich', 'Ostrich', 'savanna', 1, 'White'],
    ['giraffe', 'Giraffe', 'savanna', 2, 'Spotless'], ['hyena', 'Spotted Hyena', 'savanna', 2, 'Pale'], ['meerkat', 'Meerkat', 'savanna', 2, 'Silver'],
    ['lion', 'Lion', 'savanna', 3, 'White'], ['elephant', 'African Elephant', 'savanna', 3, 'Pink'],
    ['cheetah', 'Cheetah', 'savanna', 4, 'King'], ['rhino', 'Black Rhino', 'savanna', 5, 'Ivory'],

    ['capybara', 'Capybara', 'jungle', 1, 'Cream'], ['macaw', 'Scarlet Macaw', 'jungle', 1, 'Blue'], ['toucan', 'Toucan', 'jungle', 1, 'Golden'],
    ['spidermonkey', 'Spider Monkey', 'jungle', 2, 'White'], ['sloth', 'Sloth', 'jungle', 2, 'Golden'], ['tapir', 'Tapir', 'jungle', 2, 'Piebald'],
    ['jaguar', 'Jaguar', 'jungle', 3, 'Black'], ['orangutan', 'Orangutan', 'jungle', 4, 'Blond'], ['gorilla', 'Gorilla', 'jungle', 4, 'Silverback King'],
    ['okapi', 'Okapi', 'jungle', 5, 'Ghost'],

    ['emu', 'Emu', 'desert', 1, 'White'], ['kangaroo', 'Red Kangaroo', 'desert', 1, 'White'], ['wombat', 'Wombat', 'desert', 2, 'Golden'],
    ['camel', 'Camel', 'desert', 2, 'White'], ['dingo', 'Dingo', 'desert', 2, 'Black'], ['fennec', 'Fennec Fox', 'desert', 3, 'Snow'],
    ['koala', 'Koala', 'desert', 3, 'White'], ['devil', 'Tasmanian Devil', 'desert', 4, 'Russet'], ['komodo', 'Komodo Dragon', 'desert', 4, 'Jade'],
    ['platypus', 'Platypus', 'desert', 5, 'Pearl'],

    ['hare', 'Arctic Hare', 'arctic', 1, 'Blue'], ['reindeer', 'Reindeer', 'arctic', 1, 'White'], ['owl', 'Snowy Owl', 'arctic', 2, 'Silver'],
    ['arcticfox', 'Arctic Fox', 'arctic', 2, 'Blue'], ['seal', 'Harp Seal', 'arctic', 2, 'Golden'], ['walrus', 'Walrus', 'arctic', 3, 'Rose'],
    ['penguin', 'Emperor Penguin', 'arctic', 3, 'Golden'], ['polarbear', 'Polar Bear', 'arctic', 4, 'Honey'], ['narwhal', 'Narwhal', 'arctic', 5, 'Twin-tusk'],

    ['goat', 'Mountain Goat', 'mountain', 1, 'Black'], ['marmot', 'Marmot', 'mountain', 1, 'White'], ['yak', 'Yak', 'mountain', 2, 'Golden'],
    ['takin', 'Takin', 'mountain', 2, 'Golden'], ['redpanda', 'Red Panda', 'mountain', 3, 'Cream'], ['eagle', 'Golden Eagle', 'mountain', 3, 'White'],
    ['snubmonkey', 'Snub-nosed Monkey', 'mountain', 4, 'Platinum'], ['panda', 'Giant Panda', 'mountain', 4, 'Brown'], ['snowleopard', 'Snow Leopard', 'mountain', 5, 'Smoke'],

    ['clownfish', 'Clownfish', 'ocean', 1, 'Midnight'], ['seahorse', 'Seahorse', 'ocean', 1, 'Golden'], ['turtle', 'Sea Turtle', 'ocean', 2, 'White'],
    ['otter', 'Sea Otter', 'ocean', 2, 'Blond'], ['stingray', 'Stingray', 'ocean', 2, 'Spotted'], ['octopus', 'Giant Octopus', 'ocean', 3, 'Blue-ring'],
    ['reefshark', 'Reef Shark', 'ocean', 3, 'White-tip King'], ['dolphin', 'Dolphin', 'ocean', 3, 'Pink'], ['manta', 'Manta Ray', 'ocean', 4, 'Black'],
    ['whaleshark', 'Whale Shark', 'ocean', 5, 'Starlight'],

    ['dodo', 'Dodo', 'paleo', 4, 'White'], ['mammoth', 'Woolly Mammoth', 'paleo', 5, 'Golden'], ['sabertooth', 'Sabertooth Cat', 'paleo', 5, 'Snow'],
    ['triceratops', 'Triceratops', 'paleo', 5, 'Crimson'], ['raptor', 'Velociraptor', 'paleo', 6, 'Feathered King'], ['trex', 'Tyrannosaurus', 'paleo', 6, 'Obsidian'],

    ['jackalope', 'Jackalope', 'mythic', 4, 'Golden'], ['griffin', 'Griffin', 'mythic', 5, 'Storm'], ['unicorn', 'Unicorn', 'mythic', 5, 'Night'],
    ['phoenix', 'Phoenix', 'mythic', 6, 'Azure'], ['dragon', 'Dragon', 'mythic', 6, 'Pearl']
  ];
  D.SPECIES = {};
  D.SPECIES_LIST = SP.map(a => { const s = { id: a[0], name: a[1], biome: a[2], rarity: a[3], variant: a[4] }; D.SPECIES[s.id] = s; return s; });

  D.RARITY = {
    name:   ['', 'Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Mythical'],
    draw:   [0, 20, 30, 45, 68, 100, 150],
    upkeep: [0, 20, 40, 90, 220, 500, 1000],
    value:  [0, 500, 1200, 4000, 14000, 50000, 160000],
    weight: [0, 50, 30, 14, 5, 1.2, 0.5],
    factor: [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]
  };

  // Facilities (1x1). rp = research cost (0 = known from the start).
  D.FAC = {
    snack:      { name: 'Snack Stand',      cost: 1500,   rp: 0,   spend: 0.5,  desc: 'Visitors spend money here.' },
    bench:      { name: 'Garden Bench',     cost: 600,    rp: 0,   adjDraw: 0.06, desc: 'Adjacent habitats draw 6% more.' },
    restroom:   { name: 'Restroom',         cost: 1200,   rp: 0,   adjSpend: 0.15, desc: 'Adjacent shops earn 15% more.' },
    icecream:   { name: 'Ice Cream Cart',   cost: 2500,   rp: 15,  spend: 0.45, desc: 'A second kind of food stall.' },
    gift:       { name: 'Gift Shop',        cost: 5000,   rp: 35,  spend: 0.9,  desc: 'Strong earner.' },
    photo:      { name: 'Photo Spot',       cost: 3500,   rp: 50,  adjDraw: 0.10, desc: 'Adjacent habitats draw 10% more.' },
    kiosk:      { name: 'Info Kiosk',       cost: 4000,   rp: 70,  adjDraw: 0.04, rpAdj: 1.5, learn: true, desc: 'Adjacent habitats draw 4% more, give research, and score better on Learning.' },
    fountain:   { name: 'Fountain',         cost: 9000,   rp: 140,  adjDraw: 0.06, adjSpend: 0.10, desc: 'Boosts adjacent habitats 6% and shops 10%.' },
    cafe:       { name: 'Cafe',             cost: 18000,  rp: 220, spend: 1.3,  desc: 'Top earner.' },
    playground: { name: 'Playground',       cost: 22000,  rp: 320, crowd: 0.04, desc: 'Brings 4% more visitors to the whole zoo.' },
    vet:        { name: 'Vet Clinic',       cost: 30000,  rp: 450, vet: true, limit: 1, desc: 'Breeding succeeds more often and babies are stronger. Limit 1.' },
    lab:        { name: 'Research Lab',     cost: 40000,  rp: 380, rpw: 6, desc: 'Produces research every week.' },
    deck:       { name: 'Viewing Deck',     cost: 60000,  rp: 800, adjDraw: 0.16, desc: 'Adjacent habitats draw 16% more.' },
    gate:       { name: 'Grand Gate',       cost: 250000, rp: 1200, crowd: 0.08, limit: 1, landmark: true, desc: 'Landmark. 8% more visitors. Limit 1.' },
    center:     { name: 'Conservation Center', cost: 1200000, rp: 2500, repw: 25, rpw: 12, limit: 1, landmark: true, desc: 'Landmark. Earns reputation and research weekly. Limit 1.' },
    pavilion:   { name: 'Royal Pavilion',   cost: 5000000, rp: 4000, crowd: 0.10, repw: 40, limit: 1, landmark: true, desc: 'Landmark. 10% more visitors and weekly reputation. Limit 1.' }
  };
  D.FAC_ORDER = ['snack', 'bench', 'restroom', 'icecream', 'gift', 'photo', 'kiosk', 'fountain', 'cafe', 'playground', 'vet', 'lab', 'deck', 'gate', 'center', 'pavilion'];

  // Named combos. anchor: 'hab:<biome>' or 'fac:<type>'. needs: neighbor kinds (same notation). All must touch the anchor.
  D.COMBOS = [
    { id: 'picnic',   name: 'Safari Picnic',    anchor: 'hab:savanna',  needs: ['fac:snack', 'fac:bench'],        draw: 0.20, hint: 'A savanna habitat with somewhere to eat and somewhere to sit.' },
    { id: 'trail',    name: 'Jungle Trail',     anchor: 'hab:jungle',   needs: ['fac:bench', 'fac:kiosk'],        draw: 0.20, hint: 'A rainforest habitat with a place to rest and a place to read.' },
    { id: 'camp',     name: 'Outback Camp',     anchor: 'hab:desert',   needs: ['fac:snack', 'fac:photo'],        draw: 0.20, hint: 'An outback habitat with food and a camera.' },
    { id: 'scoop',    name: 'Polar Scoop',      anchor: 'hab:arctic',   needs: ['fac:icecream'],                  draw: 0.15, hint: 'Something cold next to something colder.' },
    { id: 'summit',   name: 'Summit View',      anchor: 'hab:mountain', needs: ['fac:deck', 'fac:photo'],         draw: 0.25, hint: 'A highland habitat seen from above, with a camera.' },
    { id: 'splash',   name: 'Splash Zone',      anchor: 'hab:ocean',    needs: ['fac:fountain', 'fac:playground'], draw: 0.25, hint: 'A reef habitat where kids can get wet.' },
    { id: 'dig',      name: 'Dino Dig',         anchor: 'hab:paleo',    needs: ['fac:kiosk', 'fac:playground'],   draw: 0.30, hint: 'Something very old, explained, with a place to play.' },
    { id: 'grove',    name: 'Enchanted Grove',  anchor: 'hab:mythic',   needs: ['fac:fountain', 'fac:bench'],     draw: 0.30, hint: 'Something impossible beside water and a garden.' },
    { id: 'icefire',  name: 'Ice and Fire',     anchor: 'hab:arctic',   needs: ['hab:desert'],                    draw: 0.10, both: true, hint: 'The coldest habitat touching the hottest.' },
    { id: 'landsea',  name: 'Land and Sea',     anchor: 'hab:ocean',    needs: ['hab:jungle'],                    draw: 0.10, both: true, hint: 'Reef touching rainforest.' },
    { id: 'highwild', name: 'High and Wild',    anchor: 'hab:mountain', needs: ['hab:savanna'],                   draw: 0.10, both: true, hint: 'Highland touching savanna.' },
    { id: 'row',      name: 'Souvenir Row',     anchor: 'fac:gift',     needs: ['fac:photo', 'fac:icecream'],     spend: 0.40, hint: 'A gift shop between a camera and a cone.' },
    { id: 'court',    name: 'Food Court',       anchor: 'fac:cafe',     needs: ['fac:snack', 'fac:icecream'],     spend: 0.35, hint: 'Three kinds of food together.' },
    { id: 'rest',     name: 'Rest Stop',        anchor: 'fac:restroom', needs: ['fac:bench', 'fac:fountain'],     crowd: 0.03, hint: 'Everything a tired visitor needs.' },
    { id: 'science',  name: 'Science Corner',   anchor: 'fac:lab',      needs: ['fac:kiosk', 'fac:vet'],          rpMult: 0.5, hint: 'Where the lab coats gather.' },
    { id: 'plaza',    name: 'Grand Plaza',      anchor: 'fac:gate',     needs: ['fac:fountain', 'fac:gift'],      crowd: 0.05, hint: 'A landmark entrance with water and shopping.' },
    { id: 'lookout',  name: 'Safari Lookout',   anchor: 'hab:savanna',  needs: ['fac:deck', 'fac:kiosk', 'fac:photo'], draw: 0.30, hint: 'A savanna habitat you can study, admire from above and photograph.' },
    { id: 'market',   name: 'Night Market',     anchor: 'fac:gift',     needs: ['fac:snack', 'fac:cafe', 'fac:fountain'], spend: 0.50, hint: 'A gift shop ringed by two kinds of food and running water.' },
    { id: 'family',   name: 'Family Corner',    anchor: 'fac:playground', needs: ['fac:icecream', 'fac:restroom', 'fac:bench'], crowd: 0.05, hint: 'Everything parents need around the place kids want to be.' },
    { id: 'station',  name: 'Field Station',    anchor: 'fac:lab',      needs: ['hab:jungle', 'hab:savanna'],     rpMult: 0.3, hint: 'A lab wedged between rainforest and savanna.' }
  ];

  // Exhibit event themes. aff: fit with each biome, 0 poor to 3 amazing.
  const A = (sa, ju, de, ar, mo, oc, pa, my) => ({ savanna: sa, jungle: ju, desert: de, arctic: ar, mountain: mo, ocean: oc, paleo: pa, mythic: my });
  D.THEMES = {
    feeding:  { name: 'Feeding Time',        rp: 0,   aff: A(2, 2, 1, 3, 1, 2, 3, 1) },
    talk:     { name: 'Keeper Talk',         rp: 0,   aff: A(1, 2, 2, 1, 3, 1, 2, 2) },
    photo:    { name: 'Photo Day',           rp: 20,  aff: A(2, 1, 2, 2, 3, 1, 1, 2) },
    kids:     { name: "Kids' Explorer Day",  rp: 40,  aff: A(1, 2, 3, 1, 1, 2, 3, 2) },
    night:    { name: 'Night Safari',        rp: 80,  aff: A(3, 2, 3, 0, 1, 0, 2, 3) },
    training: { name: 'Training Demo',       rp: 140,  aff: A(1, 3, 1, 2, 2, 3, 1, 1) },
    conserve: { name: 'Conservation Week',   rp: 220, aff: A(2, 3, 1, 3, 2, 3, 0, 0) },
    behind:   { name: 'Behind the Scenes',   rp: 320, aff: A(3, 1, 2, 1, 2, 2, 2, 1) },
    splash:   { name: 'Splash Show',         rp: 500, aff: A(0, 1, 0, 2, 0, 3, 0, 1) },
    winter:   { name: 'Winter Lights',       rp: 700, aff: A(0, 0, 1, 3, 3, 1, 1, 3) },
    fossil:   { name: 'Fossil Dig',          rp: 900, aff: A(1, 0, 2, 0, 1, 0, 3, 0), needs: 'paleo' },
    legends:  { name: 'Legends Night',       rp: 1200, aff: A(0, 1, 0, 1, 2, 0, 1, 3), needs: 'mythic' }
  };
  D.THEME_ORDER = ['feeding', 'talk', 'photo', 'kids', 'night', 'training', 'conserve', 'behind', 'splash', 'winter', 'fossil', 'legends'];
  D.AFF_WORD = ['Poor fit', 'Fair fit', 'Good fit', 'Amazing fit'];

  // General research (regions, facilities and themes are added by the engine).
  D.TECH = {
    hab3:   { name: 'Habitat Design I',  rp: 60,   desc: 'Habitats can be upgraded to level 3.' },
    hab4:   { name: 'Habitat Design II', rp: 400,  desc: 'Habitats can be upgraded to level 4.', req: 'hab3' },
    hab5:   { name: 'Habitat Design III', rp: 1500, desc: 'Habitats can be upgraded to level 5.', req: 'hab4' },
    gen1:   { name: 'Genetics I',   rp: 80,   desc: 'Babies gain +1 to stats. Rare variants are a little more likely.' },
    gen2:   { name: 'Genetics II',  rp: 500,  desc: 'Babies gain a further +1. Rare variants more likely.', req: 'gen1' },
    gen3:   { name: 'Genetics III', rp: 1800,  desc: 'Babies gain a further +1. Rare variants more likely.', req: 'gen2' },
    incub:  { name: 'Nursery',      rp: 300,  desc: 'Breeding takes 25% less time.' },
    mkt1:   { name: 'Marketing I',  rp: 70,   desc: '10% more visitors.' },
    mkt2:   { name: 'Marketing II', rp: 450,  desc: 'A further 10% more visitors.', req: 'mkt1' },
    mkt3:   { name: 'Marketing III', rp: 1600, desc: 'A further 10% more visitors.', req: 'mkt2' },
    gear1:  { name: 'Field Gear I',  rp: 90,  desc: 'Expedition teams are 15% stronger.' },
    gear2:  { name: 'Field Gear II', rp: 600, desc: 'Expedition teams are a further 15% stronger.', req: 'gear1' },
    jeep:   { name: 'Second Convoy', rp: 500, desc: 'Run two expeditions at the same time.' },
    pen:    { name: 'Bigger Holding Pen', rp: 120, desc: 'The holding pen keeps 12 animals instead of 6.' }
  };
  D.TECH_ORDER = ['hab3', 'mkt1', 'gen1', 'gear1', 'pen', 'incub', 'hab4', 'jeep', 'mkt2', 'gen2', 'gear2', 'hab5', 'mkt3', 'gen3'];

  D.ROLES = {
    keeper:     { name: 'Keeper',     main: 'care',  desc: 'Best at breeding and animal care.' },
    vet:        { name: 'Vet',        main: 'care',  second: 'sci', desc: 'Raises the chance of rare variants when leading a breeding pair.' },
    researcher: { name: 'Researcher', main: 'sci',   desc: 'Produces 50% more research on zoo duty.' },
    explorer:   { name: 'Explorer',   main: 'exp',   desc: 'Expeditions with an explorer finish a week sooner.' },
    guide:      { name: 'Guide',      main: 'charm', desc: 'Best at leading exhibit events.' },
    zoologist:  { name: 'Head Zoologist',   main: 'care',  second: 'sci',  adv: true, req: [['keeper'], ['vet', 'researcher']], desc: 'Breeding succeeds more often and babies come out stronger.' },
    leader:     { name: 'Expedition Leader', main: 'exp',  second: 'care', adv: true, req: [['explorer'], ['keeper', 'vet']], desc: 'Expedition teams are 15% stronger and a week faster.' },
    showrunner: { name: 'Showrunner',       main: 'charm', second: 'sci',  adv: true, req: [['guide'], ['researcher', 'keeper']], desc: 'Events gain a point of Fun and a point of Learning.' }
  };
  D.JOB_LEVEL = 8; // level needed before someone can change jobs
  D.STATS = { care: 'Care', sci: 'Science', exp: 'Scouting', charm: 'Charm' };
  D.COURSES = [
    { id: 'care',  name: 'Animal Handling Course', stat: 'care' },
    { id: 'sci',   name: 'Zoology Seminar',        stat: 'sci' },
    { id: 'exp',   name: 'Wilderness Training',    stat: 'exp' },
    { id: 'charm', name: 'Public Speaking Class',  stat: 'charm' }
  ];

  D.RANK_REP = [0, 120, 400, 1000, 2200, 4500, 8500, 14000, 22000, 32000];
  D.RANK_NAME = ['', 'Backyard Zoo', 'Local Zoo', 'Town Zoo', 'City Zoo', 'Regional Zoo', 'State Zoo', 'National Zoo', 'Famous Zoo', 'World-class Zoo', 'Legendary Zoo'];
  D.STAFF_CAP = [0, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8];
  // Portrait map: 10 columns by 20 rows. Row 19 is the front (bottom of the screen), where the entrance is.
  // You start with the front START_ROWS rows and buy more rows toward the back.
  D.GRID_W = 10; D.GRID_H = 20; D.START_ROWS = 8;
  D.LAND = [ // total rows owned after each purchase
    { rows: 10, cost: 8000,    rank: 2 },
    { rows: 12, cost: 40000,   rank: 3 },
    { rows: 14, cost: 160000,  rank: 5 },
    { rows: 17, cost: 700000,  rank: 7 },
    { rows: 20, cost: 2500000, rank: 8 }
  ];
  // Rough weekly income of a zoo at each rank. Optional spending (campaigns, crates, festival extras) is priced from this
  // so that money keeps mattering as the zoo grows.
  D.SCALE = [0, 700, 1100, 1800, 5000, 16000, 42000, 75000, 125000, 240000, 340000];
  D.REGION_RANK = { jungle: 2, desert: 3, arctic: 5, mountain: 6, ocean: 7 }; // zoo rank needed to research a region
  D.FAST_ROLES = ['explorer', 'leader'];                                      // roles that bring an expedition home a week sooner
  D.SHOW_MEDALS = { gold: 1, silver: 0.85, bronze: 0.7 };                     // share of the gold bar needed for each medal
  D.UPGRADE_MULT = [0, 2, 5, 14, 40];                                         // habitat upgrade cost = build cost x this, by current level
  D.VISITORS_PER_REP = 800;                                                   // weekly visitors that earn one point of reputation
  D.REVIEW_REP_DIV = 46;                                                      // review reputation = total x total / this
  D.HOF_SCORE = 34;                                                           // review total that enters the Hall of Fame
  D.CRITICS = [{ key: 'animals', name: 'Animals' }, { key: 'habitat', name: 'Habitat' }, { key: 'fun', name: 'Fun' }, { key: 'learning', name: 'Learning' }];
  D.STAT_SCORE = { charm: 'fun', wit: 'learning', vigor: 'animals' };         // which review score a star animal's best stat lifts
  D.ANIMAL_STATS = { charm: 'Charm', vigor: 'Vigor', wit: 'Wit' };

  // Hiring: pay for an advert, then see who turns up. k = cost as a share of D.SCALE, q = quality bonus, star = chance of a standout.
  D.HIRE_TIERS = [
    { key: 'board',  name: 'Notice board', k: 0.3, n: 2, q: -3, star: 0.03, note: '2 turn up' },
    { key: 'paper',  name: 'Newspaper ad', k: 1.0, n: 3, q: 3,  star: 0.08, note: '3 turn up, better' },
    { key: 'agency', name: 'Agency',       k: 3.0, n: 3, q: 9,  star: 0.16, note: '3 skilled people', rank: 3 },
    { key: 'tv',     name: 'TV appeal',    k: 8.0, n: 4, q: 16, star: 0.30, note: '4 of the best', rank: 5 }
  ];
  // Advertising campaigns (one of each kind can run at a time). vis = extra visitors while it runs, rep = share of the current rank gap gained as reputation.
  D.CAMPAIGNS = [
    { key: 'flyers', name: 'Flyers',   k: 0.3,  vis: 0.02, weeks: 4, rep: 0.0011 },
    { key: 'radio',  name: 'Radio ad', k: 0.8,  vis: 0.03, weeks: 5, rep: 0.0022 },
    { key: 'tv',     name: 'TV ad',    k: 1.8,  vis: 0.05, weeks: 6, rep: 0.0038, rank: 3 },
    { key: 'blimp',  name: 'Blimp',    k: 4.0,  vis: 0.07, weeks: 8, rep: 0.0068, rank: 5 }
  ];
  // Optional spend at the Open Day and the Summer Festival. mult = crowd multiplier, rep = share of the rank gap.
  D.YEARLY_SPEND = {
    openday:  [{ key: 'none', name: 'Just open', k: 0, mult: 1, rep: 0 }, { key: 'band', name: 'Brass band', k: 0.5, mult: 1.3, rep: 0.0045 }, { key: 'parade', name: 'Parade', k: 1.5, mult: 1.6, rep: 0.009 }, { key: 'gala', name: 'Fireworks', k: 4, mult: 2, rep: 0.015 }],
    festival: [{ key: 'none', name: 'Stalls only', k: 0, mult: 1, rep: 0 }, { key: 'music', name: 'Live music', k: 0.5, mult: 1.3, rep: 0.0045 }, { key: 'fair', name: 'Food fair', k: 1.5, mult: 1.6, rep: 0.009 }, { key: 'star', name: 'Headline act', k: 4, mult: 2, rep: 0.015 }]
  };
  D.YEARLY_NAME = { openday: 'Spring Open Day', festival: 'Summer Festival', show: 'Winter Animal Show' };
  // Mystery crate at the trader: chance of each rarity (1 to 5), by zoo rank band (ranks 1-2, 3-4, 5-6, 7-8, 9-10).
  D.CRATE_ODDS = [[55, 33, 10, 2, 0], [45, 33, 16, 5, 1], [35, 32, 22, 9, 2], [25, 30, 27, 14, 4], [15, 27, 31, 20, 7]];
  D.SUPER_CHANCE = 0.12; // training: chance of a "Super!" result worth triple
  D.LUCKY_CHANCE = 0.08; // births: chance per stat of a lucky jump
  // Happenings (random events). w = how often, bad = a mild setback, who = the person who walks up to the gate.
  D.HAPPENINGS = {
    school:     { title: 'School trip',        w: 10, who: 'teacher' },
    donor:      { title: 'A gift',             w: 9,  who: 'donor' },
    tv:         { title: 'TV spot',            w: 9,  who: 'reporter' },
    viral:      { title: 'Viral photo',        w: 9,  who: 'photographer' },
    heat:       { title: 'Heatwave',           w: 8 },
    stray:      { title: 'Stray at the gate',  w: 9,  who: 'kid' },
    scholar:    { title: 'Visiting scientist', w: 8,  who: 'professor' },
    coins:      { title: 'Buried coins',       w: 7,  who: 'builder' },
    volunteers: { title: 'Volunteer week',     w: 8,  who: 'volunteer' },
    spring:     { title: 'Spring fever',       w: 7 },
    mentor:     { title: 'Old hand',           w: 8,  who: 'elder' },
    sale:       { title: "Builder's deal",     w: 8,  who: 'builder' },
    feature:    { title: 'Magazine feature',   w: 8,  who: 'reporter' },
    storm:      { title: 'Storm',              w: 8,  bad: true },
    cold:       { title: 'A cold',             w: 8,  bad: true, who: 'vet' },
    escape:     { title: 'Slipped out',        w: 7,  bad: true, who: 'keeper' },
    powercut:   { title: 'Power cut',          w: 5,  bad: true }
  };
  // Person kinds used by happenings ('vet' and 'keeper' are also staff roles).
  D.WHO = ['teacher', 'donor', 'reporter', 'photographer', 'kid', 'professor', 'builder', 'volunteer', 'elder', 'vet', 'keeper'];
  // Habitat footprints on the hex grid, as axial [q, r] offsets from the anchor. They can be rotated in 60 degree steps.
  D.SHAPES = {
    savanna:  [[0, 0], [1, 0], [0, 1]],
    jungle:   [[0, 0], [1, 0], [0, 1], [1, -1]],
    desert:   [[0, 0], [1, 0], [2, 0], [3, 0]],
    arctic:   [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
    mountain: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]],
    ocean:    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]],
    paleo:    [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]],
    mythic:   [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
  };
  D.SHAPE_NAME = { savanna: 'triangle of 3', jungle: 'diamond of 4', desert: 'line of 4', arctic: 'block of 5', mountain: 'big triangle of 6', ocean: 'flower of 7', paleo: 'slab of 7', mythic: 'ring of 6 with an open middle' };
  D.YEARLY = { openday: 6, festival: 18, show: 40 };

  D.SEASONS = [
    { name: 'Spring', mult: 1.0 }, { name: 'Summer', mult: 1.25 }, { name: 'Autumn', mult: 0.95 }, { name: 'Winter', mult: 0.72 }
  ];

  // t = the year a strong player is expected to overtake this rival
  D.RIVALS = [
    { name: 'Castellane Royal Zoo', t: 16 }, { name: 'Nordhaven Zoological Society', t: 14.5 }, { name: 'Port Halloran Aquarium', t: 13 },
    { name: 'Mount Arden Animal Park', t: 11.5 }, { name: 'Redwater Safari', t: 10 }, { name: 'Linden Gardens Zoo', t: 8.5 },
    { name: 'Harbor Point Wildlife Park', t: 7 }, { name: 'Greyfield Wildlife Trust', t: 5.5 }, { name: 'Saint Odile Menagerie', t: 4.2 },
    { name: 'Brackenmoor Zoo', t: 3 }, { name: 'Kessler Family Zoo', t: 1.8 }
  ];

  D.VIPS = [
    { id: 'reporter', name: 'A local reporter', when: 'your first exhibit event', rep: 15, money: 1000, boost: 0.10 },
    { id: 'critic',   name: 'The famous critic Odalys Verne', when: 'an exhibit event scoring 30 or more', rep: 120, money: 20000, boost: 0.20 },
    { id: 'filmcrew', name: 'A nature documentary crew', when: 'discovering 15 species', rep: 100, money: 15000, boost: 0.20 },
    { id: 'photog',   name: 'Wildlife photographer Ines Okafor', when: 'your first rare variant', rep: 80, money: 8000, boost: 0.15 },
    { id: 'mayor',    name: 'The Mayor', when: 'reaching the top 5 in the rankings', rep: 150, money: 40000, boost: 0.15 },
    { id: 'professor', name: 'The eccentric Professor Quill', when: 'discovering 35 species', rep: 200, money: 60000, boost: 0.15 },
    { id: 'royal',    name: 'A royal delegation', when: 'becoming the number 1 zoo', rep: 600, money: 500000, boost: 0.30 },
    { id: 'legend',   name: 'A storyteller from far away', when: 'housing a mythical creature', rep: 400, money: 250000, boost: 0.25 }
  ];

  D.ANIMAL_NAMES = ['Mango', 'Biscuit', 'Juno', 'Tobi', 'Pepper', 'Nala', 'Rolo', 'Suki', 'Bram', 'Olive', 'Ziggy', 'Mabel', 'Koa', 'Fig', 'Tansy', 'Otis', 'Wren', 'Dune', 'Pip', 'Sable', 'Moss', 'Hazel', 'Bo', 'Clover', 'Indy', 'Marlo', 'Nori', 'Quill', 'Rue', 'Sunny', 'Tuck', 'Uma', 'Vesper', 'Willow', 'Yuki', 'Zola', 'Arlo', 'Basil', 'Coco', 'Dot', 'Echo', 'Fern', 'Gus', 'Honey', 'Iggy', 'Jax', 'Kiki', 'Lark', 'Miso', 'Nutmeg', 'Opal', 'Poppy', 'Rusty', 'Sage', 'Tilly', 'Umber', 'Vito', 'Waffle', 'Xena', 'Yam', 'Zeke', 'Ash', 'Birdie', 'Cricket', 'Dash', 'Ember', 'Flint', 'Ginger', 'Huck', 'Ivy'];
  D.FIRST = ['Ada', 'Ben', 'Carmen', 'Dev', 'Elif', 'Farid', 'Greta', 'Hiro', 'Imani', 'Jonas', 'Kavya', 'Leo', 'Mina', 'Nico', 'Oksana', 'Pablo', 'Quinn', 'Rosa', 'Sven', 'Tamar', 'Uri', 'Vera', 'Wes', 'Ximena', 'Yusuf', 'Zadie', 'Anouk', 'Bodhi', 'Cleo', 'Dario', 'Esme', 'Felix', 'Gwen', 'Hana', 'Idris', 'Jules'];
  D.LAST = ['Abara', 'Brandt', 'Castillo', 'Dufresne', 'Eklund', 'Fontaine', 'Grigor', 'Halvorsen', 'Ito', 'Jovanic', 'Kaplan', 'Lindqvist', 'Moreau', 'Nakata', 'Okonjo', 'Petrov', 'Quist', 'Rahimi', 'Sorensen', 'Tanaka', 'Umeh', 'Varga', 'Whitlock', 'Yilmaz', 'Zubiri', 'Marsh', 'Pell', 'Harrow', 'Finch', 'Rook'];

  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.ZD = D;
})(typeof window !== 'undefined' ? window : globalThis);
