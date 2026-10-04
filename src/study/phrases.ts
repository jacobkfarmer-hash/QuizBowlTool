import { normalizeAnswer } from './answers';
import { conceptTokens, escapePattern, STOP } from './clue-text';
import type { ClueOccurrence } from './types';

export function cleanCluePhrase(value: string, target: string): string {
  let text = value.replace(/\(\*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\b(?:for (?:ten|10) points|FTP|FTPE),?\s*/gi, '')
    .replace(/^(?:this|that)\s+(?:play|novel|poem|work|sculpture|painting)[’']s\s+/i, '')
    .replace(/^(?:name|identify|what)\s+(?:this|the)?\s*(?:(?:Italian|American|English|French|Baroque|Renaissance)\s+)*(?:artist|sculptor|author|composer|creator|play|work|novel|painting|sculpture)\s+(?:who\s+)?(?:of\s+)?/i, '')
    .replace(/^(?:in|of|from)\s+(?:a|this|the)\s+(?:play|novel|poem|work|sculpture|painting)[,:]?\s*/i, '')
    .replace(/^(?:one|a|another)\s+(?:character|figure)\s+in\s+this\s+(?:play|novel|work)\s+/i, '')
    .replace(/^(?:this|that)\s+(?:artist|sculptor|painter|author|composer|man|person)'?[’']?s?\s+/i, '')
    .replace(/^this\s+(?:play|novel|poem|work|country|city|person|battle)\s+/i, '')
    .replace(/\b(?:this|that)\s+(play|novel|poem|work|country|city|person|battle)\b/gi, 'the $1')
    .replace(/\b(?:during|in|on|at|with|by|for|to)\s+(?:a|an|the|this)?\s*$/i, '')
    .replace(/\s+/g, ' ').replace(/^[\s,.:;’']+|[\s,.:;!?]+$/g, '').trim();
  if (!text || normalizeAnswer(text).includes(normalizeAnswer(target))) return '';
  // Remove only grammatical scaffolding. Negation and identifying actions remain intact.
  text = text.replace(/^A\s+/i, '').replace(/\b(?:is depicted|is shown|is portrayed)\s+/gi, '')
    .replace(/\b(?:this|the|a)\s+(?:title|titular)\s+/gi, '').replace(/\b(?:the|a)\s+(?:title|titular)\s+/gi, '')
    .replace(/\b(?:in|of|by)\s+(?:his|her|their|this (?:artist|sculptor)[’']s)\s+(?:work\s+)?/gi, 'in ')
    .replace(/\b(?:unfinished|incomplete)\s+(?:work\s+)?titled\s+/gi, 'unfinished ')
    .replace(/^(?:depicted|showed|portrayed)\s+/i, '')
    .replace(/\b(?:appears?|occurs?)\s+(?:frequently\s+)?in\s+(?:the\s+)?/gi, 'in ')
    .replace(/\s+(?:of|by|in)\s+(?:this|the)\s+(?:artist|sculptor|author|play|novel|work)\b/gi, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function detailStrength(phrase: string, anchor: string): number {
  const anchorTokens = new Set(conceptTokens(anchor));
  const details = conceptTokens(phrase).filter(t => !anchorTokens.has(t));
  const specificAction = /\b(?:unfinished|lying|lies|sarcophagus|fleeing|fled|pressing|presses|fingers|turning|transforms?|tree|holding|holds|surrounded|depicts?|features?|showing|contains?|located|suicide|window|bulb|engraved|spear|angel|rays|pursues?|wrote|written|fought|discovered|invented)\b/i.test(phrase);
  return Math.min(8, details.length) + (specificAction ? 2 : 0);
}
function contextFragments(context: string, anchor: string, target: string): string[] {
  const direct = cleanCluePhrase(context, target);
  const phrases = [direct];
  // Preserve titles containing commas while cutting other clause boundaries.
  const marker = '\uE001';
  const actualAnchor = context.match(new RegExp(escapePattern(anchor), 'i'))?.[0] || anchor;
  const protectedContext = context.replace(new RegExp(escapePattern(anchor), 'gi'), marker);
  for (const clause of protectedContext.split(/[,;]|\s+(?:after|before|while|whereas|although|because|and earlier|and then)\s+/)) {
    const restored = clause.replace(/\uE001/g, actualAnchor);
    if (normalizeAnswer(restored).includes(normalizeAnswer(anchor))) phrases.push(cleanCluePhrase(restored, target));
  }
  const location = context.toLowerCase().indexOf(anchor.toLowerCase());
  if (location >= 0) {
    const before = context.slice(0, location), after = context.slice(location + anchor.length);
    // Preserve an attested short modifier even when the source inserts "work ... titled".
    if (!/^(?:depicts?|shows?|features?)\b/i.test(anchor) && /\b(?:unfinished|incomplete)\b/i.test(before) && !/\b(?:another|other)\b/i.test(before.slice(before.search(/\b(?:unfinished|incomplete)\b/i)))) {
      phrases.push(`Unfinished ${actualAnchor}`);
    }
    const located = before.match(/\b(?:located|stands?|standing|situated)\s+in\s+(.+?)\s+(?:is|called|titled)\s*(?:the\s*)?$/i);
    if (located) phrases.push(cleanCluePhrase(`${actualAnchor} in ${located[1]}`, target));
    // Descriptive body before "in [title]" often supplies the key action or image.
    const relation = before.match(/\b(?:in|called|titled|entitled)\s+(?:(?:his|her|their|the|a|this (?:artist|sculptor)[’']s)\s+)?(?:work\s+)?$/i);
    if (relation) {
      let body = before.slice(0, relation.index).replace(/^(?:this|that)\s+(?:artist|sculptor|man|person)\s+(?:depicts?|depicted|shows?|showed|portrays?|portrayed)\s+/i, '');
      body = body.replace(/^.*?\b(?:sculpture|work)\s+(?:by\s+this\s+(?:artist|man|sculptor)\s+)?(?:depicts?|shows?|portrays?)\s+/i, '');
      const image = body.match(/\b(?:a|an|the)\s+((?:angel|woman|nun|man|figure|nymph)\b.*)$/i);
      if (image && image[1].split(/\s+/).length <= 12) body = image[1];
      const lying = body.match(/\b(?:woman|figure|nun)\s+(?:lying|holding|fleeing|turning)\b.*$/i);
      if (lying) body = lying[0];
      if (body.split(/\s+/).length <= 14) phrases.push(cleanCluePhrase(`${body} in ${actualAnchor}`, target));
    }
    const actions = [...before.matchAll(/\b(?:unfinished|incomplete|throws?|thrown|hurled|covers?|covering|rips?|burns?|burned|lying|holding|pressing|fleeing|turning|transforming|surrounded|depicts?|showing|features?)\b/gi)];
    const action = actions.at(-1);
    if (action && before.slice(action.index).split(/\s+/).length <= 7) {
      const suffix = after.split(/[,;.!?]|\s+(?:after|before|while|and earlier|because)\s+/)[0];
      phrases.push(cleanCluePhrase(`${before.slice(action.index)}${anchor}${suffix}`, target));
    }
    // An anchor with an intact identifying clause is preferable to a word-window truncation.
    const tail = after.match(/^\s+(?:depicts?|shows?|features?|portrays?)\s+(.+?)[.!?]?$/i);
    if (tail && tail[1].split(/\s+/).length <= 12) phrases.push(cleanCluePhrase(`${tail[1]} in ${anchor}`, target));
    const prefix = before.match(/\b(?:unfinished|incomplete|famous)\s*$/i);
    if (prefix) phrases.push(cleanCluePhrase(`${prefix[0]} ${anchor}${after.split(/[.!?]/)[0]}`, target));
    // Short prepositional descriptions often supply location, objects, or relationships.
    const descriptor = after.match(/^\s+(?:(?:is|was)\s+)?(?:located in|in|with|featuring|showing|depicting|lying|holding|fleeing|turning|covers?|burns?|sits?|surrounded by)\b[^,;.!?]*/i);
    if (descriptor) phrases.push(cleanCluePhrase(`${anchor}${descriptor[0]}`, target));
  }
  // A creator association is phrased as a relation when the source explicitly supplies it.
  const creator = context.match(/^\s*(.+?)\s+(?:wrote|created|composed|painted|sculpted)\s+(?:this|the)\s+(?:play|novel|work|poem|opera|symphony|painting|sculpture)[.!?]?$/i);
  if (creator && normalizeAnswer(creator[1]).includes(normalizeAnswer(anchor))) phrases.push(`Written by ${creator[1]}`.replace(/^Written/, /composed/i.test(context) ? 'Composed' : /painted/i.test(context) ? 'Painted' : /sculpted/i.test(context) ? 'Sculpted' : /created/i.test(context) ? 'Created' : 'Written'));
  if (new RegExp(`\\b(?:written|composed|painted|created) by\\s+${escapePattern(actualAnchor)}`, 'i').test(context)) phrases.push(`Written by ${actualAnchor}`.replace(/^Written/, /composed by/i.test(context) ? 'Composed' : /painted by/i.test(context) ? 'Painted' : /created by/i.test(context) ? 'Created' : 'Written'));
  return phrases.filter(Boolean);
}
export function generateCluePhrase(anchor: string, occurrences: ClueOccurrence[], target: string): string {
  const candidates = [anchor, ...occurrences.flatMap(o => {
    const fragments = contextFragments(o.context, o.anchor || anchor, target);
    return o.associatedTitle ? fragments.filter(p => p.split(/\s+/).length <= 12).map(p => `${p} in ${anchor}`) : fragments;
  })].map(p => cleanCluePhrase(p, target));
  const eligible = [...new Set(candidates)].filter(p => {
    const words = p.split(/\s+/).length;
    return words <= Math.min(24, anchor.split(/\s+/).length + 12) && words >= 2 && !/^(?:s|who|whose|which|while|where|when|of works|what)\b/i.test(p) && !normalizeAnswer(p).includes(normalizeAnswer(target));
  });
  const normalizedAnchor = new Set(conceptTokens(anchor));
  const supported = eligible.filter(p => {
    const tokens = new Set(conceptTokens(p));
    return [...normalizedAnchor].filter(t => tokens.has(t)).length >= Math.min(2, normalizedAnchor.size);
  });
  const contextCounts = new Map<string, Set<string>>();
  for (const o of occurrences) for (const token of conceptTokens(o.context)) {
    if (!contextCounts.has(token)) contextCounts.set(token, new Set());
    contextCounts.get(token)!.add(`${o.kind}:${o.questionId}`);
  }
  const quality = (p: string) => {
      const details = conceptTokens(p).filter(t => !normalizedAnchor.has(t));
      const recurrent = details.filter(t => (contextCounts.get(t)?.size || 0) >= 2).length;
      const filler = p.split(/\s+/).filter(t => STOP.has(normalizeAnswer(t))).length;
      const strength = detailStrength(p, anchor), words = p.split(/\s+/).length;
      const boilerplate = /\b(?:artist|sculptor|works like|name this|creator of|created|sculpted|best known|first title concept|another work|of works)\b/i.test(p) ? 6 : 0;
      const actions = [...p.matchAll(/\b(?:unfinished|lying|holding|fleeing|pressing|fingers|thrown|throws?|transforms?|turning|swooning|spear|suicide|located|wrote|written)\b/gi)].length;
      const action = actions ? 4 + Math.min(2, actions - 1) : 0;
      const location = p.toLowerCase().startsWith(`${anchor.toLowerCase()} in `) && /\bin (?:the )?[A-Z]/.test(p) ? 5 : 0;
      const creator = /^(?:Written|Composed|Painted|Created|Sculpted) by /i.test(p) ? 8 : /\b(?:written|composed|painted) by /i.test(p) ? -5 : 0;
      const multiple = /\b(?:and frequently|and then|later|is interrupted when|refers to)\b/i.test(p) ? 4 : 0;
      const completeAnchor = normalizedAnchor.size >= 3 && /\b(?:throws?|thrown|hurled|burns?|covers?|fleeing|turning|transforms?)\b/i.test(anchor) && normalizeAnswer(p) === normalizeAnswer(anchor) ? 4 : 0;
      return Math.min(3, details.length) + (strength >= 2 ? 4 : 0) + action + location + creator + completeAnchor + Math.min(5, recurrent) * .7 - boilerplate - multiple - filler * .15 - words * .65 - Math.max(0, words - 18) * 2;
  };
  const ranked = supported.map(text => ({ text, score: quality(text) })).sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  return ranked[0]?.text || cleanCluePhrase(anchor, target);
}
