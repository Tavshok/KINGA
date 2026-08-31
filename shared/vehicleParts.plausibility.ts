/**
 * Quote-line semantic plausibility guard for unresolved vehicle part names.
 *
 * Never use this guard to reject a resolved canonical catalogue part.
 */
// ─── Semantic Plausibility Guard ─────────────────────────────────────────────
//
// Used by the hallucination guard in quoteExtractionEngine when resolveComponent
// returns null (i.e. the name is not in the parts dictionary). Instead of a hard
// reject, we ask: "is this a recognisable English/automotive word or phrase that
// could plausibly appear on a vehicle repair quote?"
//
// Strategy (hybrid, no external packages):
//   1. Character-pattern hard-reject: random strings, pure numbers, very short
//      tokens, or strings with excessive non-alpha characters are rejected.
//   2. Domain word-set check: every meaningful token must appear in either
//      (a) the AUTOMOTIVE_DOMAIN_WORDS set (curated from all part names/aliases
//          plus common workshop/repair vocabulary), or
//      (b) a GENERAL_REPAIR_WORDS set (English words that commonly appear in
//          repair quotes but are not vehicle parts themselves).
//   3. If at least 60% of meaningful tokens pass the word-set check, the name
//      is considered plausible and passes through as is_unresolved=true.
//
// This means:
//   "headlamps"         → passes  (token "headlamps" is in domain set)
//   "sundries"          → passes  (in repair words)
//   "radiator support"  → passes  (both tokens in domain set)
//   "paint material"    → passes  (both tokens in repair words)
//   "nuojgfop"          → rejects (not a word, fails pattern check)
//   "A4B7X"             → rejects (looks like a code, not a description)
//   "123"               → rejects (pure number)

/** All meaningful tokens extracted from the VEHICLE_PARTS taxonomy (auto-seeded). */
const AUTOMOTIVE_DOMAIN_WORDS = new Set<string>([
  // Auto-extracted from VEHICLE_PARTS names and aliases
  "4x4","absorber","ac","actuator","adjustment","air","airbag","airbags","aircon",
  "alignment","alloy","anti","arch","arm","assembly","assy","auxiliary","back",
  "badge","bag","bags","ballast","bar","bay","beam","bed","belt","bezel","bin",
  "body","bolster","bolt","bolts","bonnet","boot","bottom","box","bracket","brackets",
  "bulb","bull","bumper","cab","camber","canopy","cap","carrier","case","cat",
  "catalytic","center","central","centre","charge","chassis","chin","clamps","coil",
  "complete","condenser","conditioning","constant","control","converter","coolant",
  "cooler","cooling","core","cover","cowl","cradle","crash","cross","crossmember",
  "curtain","cv","dam","decklid","defroster","demister","diesel","diff","differential",
  "diffuser","door","drive","driver","drivetrain","driving","duct","ecu","electric",
  "element","emblem","end","energy","engine","exhaust","exterior","eye","facia","fan",
  "fascia","fender","floor","foam","fog","frame","front","fuel","gas","gasket","gate",
  "gear","glass","globe","grill","grille","guard","guide","guides","handle","header",
  "headlamp","headlamps","headlight","headlights","headliner","heated","hid","hinge",
  "hinges","hitch","hood","hook","house","housing","hvac","impact","indicator","inner",
  "inside","insulation","insulator","intercooler","interior","isolators","joint",
  "joints","knee","lamp","latch","leaf","led","left","lens","lid","liftgate","light",
  "lights","liner","lining","linkage","lip","load","lock","locking","logo","lower",
  "luggage","mag","main","manifold","mechanism","member","mirror","module","monocoque",
  "moonroof","motor","moulding","mount","mounting","mountings","mounts","mudguard",
  "muffler","nerf","nudge","number","oil","outer","outside","pad","pan","panel",
  "panoramic","passenger","petrol","pickup","pillar","pipe","plate","power","prop",
  "propeller","propshaft","push","quarter","rack","rad","radiator","rails","rear",
  "rebar","recharge","refrigerant","regas","registration","regulator","reinforcement",
  "reprogram","right","rim","rocker","rod","roll","roof","rubber","running","screen",
  "scuttle","seal","seat","seatbelt","set","shaft","sheet","shell","shock","shocks",
  "side","signal","silencer","sill","skid","skin","skirt","slam","slide","sliding",
  "splitter","spoiler","spot","spring","srs","stabiliser","stalk","steering","step",
  "strip","strut","struts","subframe","sump","sunroof","support","suspension","suv",
  "sway","system","tail","tailgate","taillight","tank","tie","tire","tonneau","top",
  "tow","towbar","track","trailer","trailing","transfer","trim","truck","trunk","tube",
  "turn","tyre","tyres","underbody","undershield","unit","upper","valance","vehicle",
  "velocity","vent","wheel","wheels","window","windows","windscreen","windshield",
  "wing","wiper","wipers","wishbone","xenon",
  // Common SA abbreviations used in quotes
  "lh","rh","lhs","rhs","lf","rf","rl","rr","fb","rb","qp","bkt","asm","incl","excl",
  "assy","no","nr","qty","ea","pc","pcs","pr","set","kit","oe","oem",
  // Additional automotive terms not in taxonomy
  "abs","acc","adas","adaptive","alternator","antenna","axle","battery","bearing",
  "boot","brake","brakes","bumperette","bush","bushing","cable","caliper","cam",
  "camshaft","catalytic","clutch","coilover","compressor","crankshaft","crossbar",
  "cylinder","damper","deflector","disc","distributor","driveshaft","drum","dynamo",
  "filter","flywheel","gearbox","generator","grease","halfshaft","harness","hub",
  "ignition","injector","intercooler","knuckle","lifter","manifold","mounts","nozzle",
  "oxygen","piston","plug","pressure","pump","pushrod","relay","reservoir","ring",
  "rotor","sensor","servo","shaft","solenoid","spark","spindle","starter","strainer",
  "sway","switch","tensioner","thermostat","throttle","timing","torque","transmission",
  "turbo","turbocharger","universal","valve","velocity","viscous","washer","wiring",
  // Common part name variants and modifiers
  "reinforcer","reinforcing","reinforced","deflector","deflecting",
  "absorber","absorbing","retainer","retaining","retainer",
  "liner","lining","cladding","casing","housing","enclosure",
  "crossbar","crossmember","crossbeam","crosspiece",
  "bracket","bracing","brace","strapping","strap",
  "mounting","fastener","fastening","clip","clamp","clamps",
]);

/** Common English words that appear in repair quotes but are not vehicle parts. */
const GENERAL_REPAIR_WORDS = new Set<string>([
  // Repair actions
  "repair","replace","refinish","repaint","respray","strip","refit","align","weld",
  "straighten","blend","polish","clean","inspect","adjust","calibrate","program",
  "flush","bleed","charge","regas","recharge","remove","install","fit","supply",
  "paint","labour","labor","work","service","overhaul","rebuild","recondition",
  // Cost categories
  "sundries","consumables","materials","parts","spares","accessories","hardware",
  "fluids","chemicals","adhesive","sealant","primer","filler","clear","coat","base",
  "metallic","solid","pearl","effect","colour","color","tint","mix","mixing",
  // Modifiers and descriptors
  "new","used","reconditioned","aftermarket","genuine","oem","pattern","second",
  "hand","refurbished","remanufactured","exchange","core","deposit","surcharge",
  "complete","assembly","kit","set","pair","single","left","right","front","rear",
  "upper","lower","inner","outer","top","bottom","centre","center","side","end",
  "small","large","medium","short","long","heavy","light","standard","premium",
  // Administrative/financial line items
  "vat","tax","levy","fee","charge","discount","rebate","credit","debit","total",
  "subtotal","sub","balance","deposit","advance","payment","invoice","quote",
  "estimate","assessment","inspection","report","administration","admin","handling",
  "delivery","collection","storage","towing","hire","rental","courtesy","car",
  // Common English words in part descriptions
  "and","the","of","for","with","to","in","on","at","by","from","into","onto",
  "assembly","bracket","cover","panel","trim","seal","gasket","pad","clip","bolt",
  "nut","screw","washer","pin","spring","ring","cap","plug","hose","pipe","tube",
  "wire","cable","harness","connector","switch","relay","sensor","module","unit",
  "motor","pump","valve","filter","bearing","bush","seal","ring","kit","set",
]);

/**
 * Determine whether a raw part name is semantically plausible for a vehicle
 * repair quote. Used as the second gate in the hallucination guard when
 * resolveComponent() returns null.
 *
 * Returns:
 *   "plausible"   — name looks like a genuine repair quote line item
 *   "implausible" — name is clearly nonsense (random chars, pure number, etc.)
 *   "uncertain"   — name has some recognisable tokens but not enough to be sure
 *                   (caller should treat as plausible to avoid false rejections)
 */
export function isPlausiblePartName(rawName: string): "plausible" | "implausible" | "uncertain" {
  const trimmed = rawName.trim();
  if (!trimmed) return "implausible";

  // ── Hard-reject patterns ──────────────────────────────────────────────────
  // 1. Pure number (e.g. "123", "4500")
  if (/^\d+(\.\d+)?$/.test(trimmed)) return "implausible";

  // 2. Very short (1-3 chars) and not a known abbreviation
  if (trimmed.length <= 3 && !AUTOMOTIVE_DOMAIN_WORDS.has(trimmed.toLowerCase())) return "implausible";

  // 3. Excessive non-alpha characters (>40% of non-space chars are digits/symbols)
  //    Catches things like "A4B7-X99", "##ERROR##", "???", part codes
  //    NOTE: count BEFORE stripping symbols to catch "##ERROR##" (6 of 9 chars are #)
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const totalCount = trimmed.replace(/\s/g, '').length;
  if (totalCount > 0 && alphaCount / totalCount < 0.6) return "implausible";

  // 4. Looks like a random string: no vowels in any token of length >= 5
  //    "nuojgfop" has vowels but is still random — catch by vowel-consonant ratio
  const tokens = trimmed.toLowerCase().split(/[\s\/\-_,()]+/).filter(t => t.length >= 3);
  if (tokens.length === 0) return "implausible";

  let implausibleTokens = 0;
  for (const tok of tokens) {
    const vowels = (tok.match(/[aeiou]/g) || []).length;
    const consonants = (tok.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    // A token with no vowels and length >= 4 is likely an abbreviation or gibberish
    // Allow known abbreviations; reject unknown ones >= 5 chars with no vowels
    if (vowels === 0 && tok.length >= 5 && !AUTOMOTIVE_DOMAIN_WORDS.has(tok)) {
      implausibleTokens++;
    }
    // For tokens not in domain sets, use bigram plausibility:
    // Real English words have common letter pairs (bigrams). Random strings don't.
    // Common English bigrams: th, he, in, er, an, re, on, en, at, es, st, nt, etc.
    const COMMON_BIGRAMS = new Set([
      'th','he','in','er','an','re','on','en','at','es','st','nt','ou','ed','to',
      'it','is','hi','or','as','ar','al','nd','le','de','se','te','me','ng','ha',
      'ti','ve','co','ra','ro','li','ri','si','ca','la','ma','na','ta','wa','sh',
      'tr','pr','pl','cl','cr','br','gr','fr','dr','sp','sc','sk','sm','sn','sw',
      'ck','ss','ll','tt','ff','rr','pp','mm','nn','oo','ee','ai','ea','ie','ue',
    ]);
    if (tok.length >= 5 &&
        !AUTOMOTIVE_DOMAIN_WORDS.has(tok) &&
        !GENERAL_REPAIR_WORDS.has(tok)) {
      // Count how many consecutive character pairs are common English bigrams
      let bigramMatches = 0;
      for (let i = 0; i < tok.length - 1; i++) {
        if (COMMON_BIGRAMS.has(tok[i] + tok[i + 1])) bigramMatches++;
      }
      const bigramRatio = bigramMatches / (tok.length - 1);
      // Real English words typically have >25% bigram matches.
      // Random strings like "nuojgfop" have 0% bigram density.
      // Use OR: low bigrams alone is sufficient to flag as implausible
      // (don't require high vowel ratio — random strings can have vowels).
      if (bigramRatio < 0.25) {
        implausibleTokens++;
      }
    }
  }

  // ── Domain word-set check ─────────────────────────────────────────────────
  let matchedTokens = 0;
  for (const tok of tokens) {
    if (AUTOMOTIVE_DOMAIN_WORDS.has(tok) || GENERAL_REPAIR_WORDS.has(tok)) {
      matchedTokens++;
    } else {
      // Partial match: check if tok is a substring of any domain word or vice versa
      // (handles plurals, compound words, slight variations)
      const partialMatch = [...AUTOMOTIVE_DOMAIN_WORDS, ...GENERAL_REPAIR_WORDS]
        .some(w => (w.length >= 4 && tok.includes(w)) || (tok.length >= 4 && w.includes(tok)));
      if (partialMatch) matchedTokens++;
    }
  }

  const matchRatio = tokens.length > 0 ? matchedTokens / tokens.length : 0;
  const implausibleRatio = tokens.length > 0 ? implausibleTokens / tokens.length : 0;

  // If more than half the tokens are implausible → reject
  if (implausibleRatio > 0.5) return "implausible";

  // If at least 60% of tokens are in the domain word sets → plausible
  if (matchRatio >= 0.6) return "plausible";

  // Otherwise → uncertain (caller treats as plausible to avoid false rejections)
  return "uncertain";
}

