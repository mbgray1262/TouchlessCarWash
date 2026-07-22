/**
 * Self-serve NAME filters — the single source of truth.
 *
 * These decide "this business cannot be a customer self-serve wand bay" from the NAME alone,
 * before any photo is fetched. They exist because vision reliably misreads certain businesses:
 * a wand-on-a-car photo at a detail shop, a tunnel chain's bay-looking interior, a gas station's
 * in-bay automatic. On those, the name is the more reliable signal — so the name decides.
 *
 * Imported by BOTH scripts/classify-selfserve.mjs (the vision classifier) and the queue-cleanup
 * pass, so the two can never drift apart. Adding a brand here fixes it everywhere at once.
 */

// Known EXPRESS TUNNEL chains — conveyor/tunnel washes, never customer self-serve wand bays.
// NB "express" in a bare name is only a HINT, never a hard reject — Michael confirmed
// "Tsunami Express" and "Jerry's Express" as real self-serve. Only NAMED chains belong here.
export const EXPRESS_CHAINS = /\b(zips?|tidal\s*wave|quick\s*quack|tommy'?s|tommy\s*terrific|whitewater|white\s*water|raceway\s*express|bluewave|blue\s*wave|mister\s+car\s*wash|take\s*5|whistle\s*express|club\s*car\s*wash|go\s*car\s*wash|super\s*star|el\s*car\s*wash|mammoth|caliber|spinx|wildwater|splash\s*car\s*wash\s*express|flagship|autobell|delta\s*sonic\s*express|drive\s*&?\s*n?\s*shine)\b/i;

// Attendant HAND-WASH / DETAIL / mobile / tint-wrap shops — staff wash the car, or it's a
// detail/tint business, NOT a customer self-serve wand bay.
export const HANDWASH_DETAIL = /\bhand[\s-]?(car\s*)?wash\b|\bmobile[\s-]?(detail|wash|car)|\bfull[\s-]?service\b|\btint\b|\bwrap\b|\bppf\b|ceramic[\s-]?coat|\bauto\s*salon\b|\bdetail(ing)?\s+(shop|cent(er|re)|studio|garage|pros?)\b/i;

// A name with a real WASH signal is a car wash even if it also details — never auto-rejected
// by the detail filter. Carve-out for e.g. "Sof-Spra Car Wash and Auto Detailing".
export const HAS_WASH_SIGNAL = /\bwash\b|car\s*wash|carwash|self[\s-]?serv|wash\s*bay|coin[\s-]?op|laser\s*wash|touchless|\bwand\b|\bsuds\b|\bspray\b|\bfoam\b/i;

// DETAIL-ONLY shops: detailing / tint / wrap / ceramic / paint-correction with NO wash signal.
export const DETAIL_SHOP = /\bdetail(ing|s)?\b|ceramic\s*coat|paint\s*correction|\bppf\b|window\s*tint|\btint(ing)?\b|vinyl\s*wrap/i;

// GAS / convenience brands — their washes are almost always automatic (in-bay/tunnel).
export const GAS_STATION = /\b(mobil|shell|chevron|exxon|texaco|conoco|phillips\s*66|valero|sunoco|citgo|sinclair|marathon|arco|\bbp\b|circle\s*k|sheetz|kwik[\s-]?trip|kwik[\s-]?star|wawa|quik[\s-]?trip|qt\b|racetrac|speedway|casey'?s|cenex|kum\s*&?\s*go|maverik|love'?s\s*travel|pilot\s*(travel|flying)|flying\s*j|7[\s-]?eleven|costco|sam'?s\s*club|buc[\s-]?ee'?s|murphy\s*(usa|express)|hy[\s-]?vee|holiday\s*station|meijer|thornton'?s|royal\s*farms|stripes|allsup'?s|get\s*go|getgo|gpm|circle|kroger\s*fuel)\b/i;

// Big-rig / commercial TRUCK washes — a different business than a consumer self-serve car wash.
export const TRUCK_WASH = /\btruck\s*(o|0)?mat\b|\btruck\s*tub\b|\btruck\s*wash(es|ing)?\b|\bbig\s*rig\b|\bfleet\s*wash(es|ing)?\b|\bsemi\s*(truck\s*)?wash\b|\b18[\s-]?wheeler\b|blue\s*beacon|\bwash\s*my\s*truck\b|\bwashout\b|\breefer\b|\btrailer\s*wash|\btruck\b[\s\S]{0,20}\bwash(out|ing|es)?\b/i;

/**
 * Name-only verdict. Returns null when the name says nothing decisive (→ needs photos/vision).
 *   { verdict: 'truck' | 'no', reason }
 */
export function nameVerdict(name) {
  const n = name || '';
  if (TRUCK_WASH.test(n))      return { verdict: 'truck', reason: 'commercial truck wash (name)' };
  if (EXPRESS_CHAINS.test(n))  return { verdict: 'no', reason: 'express tunnel chain (name)' };
  if (HANDWASH_DETAIL.test(n)) return { verdict: 'no', reason: 'hand-wash / detail / tint shop (name)' };
  if (DETAIL_SHOP.test(n) && !HAS_WASH_SIGNAL.test(n))
                               return { verdict: 'no', reason: 'detailing / tint shop — no wash signal in name' };
  if (GAS_STATION.test(n))     return { verdict: 'no', reason: 'gas / convenience station (name)' };
  return null;
}
