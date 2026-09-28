/* Shop, club, dealer and hotel signs for the buildings (2026-09-26).
 *
 * 48 fictional businesses, each drawn once into a 4 x 12 atlas of 4:1 cells:
 * its own typeface, colours, a small drawn emblem and a tagline, so a street
 * of shops reads as a street of different businesses rather than one sign
 * repeated. Car dealers carry the game's own fictional marques.
 *
 * Kinds: 'neon' (tubes on a dark board: the letters and emblem glow at
 * night), 'box' (a lightbox: the whole face glows), 'paint' (painted, lit
 * only by the street). A second canvas holds the glow mask (a 2D canvas is
 * premultiplied, so alpha cannot carry it).
 */
import * as T from 'three';

export const COLS = 4, ROWS = 17;
/* [name, tagline, background, ink, font, kind, emblem, accent] */
export const SIGNS = [
  // food 0-9
  ['Luna Café', 'espresso · pastry · since 1994', '#f3ead8', '#24463a', 'italic 700 74px Georgia', 'paint', 'cup', '#b9793c'],
  ['TACOS EL SOL', 'al pastor · open late', '#f2c14e', '#8a1c10', '900 78px Impact', 'box', 'sun', '#d4471f'],
  ['SUSHI KAZE', 'omakase · sake bar', '#f7f4ee', '#b8222a', '700 74px Futura', 'box', 'wave', '#1e3550'],
  ['PIZZERIA ROMA', 'wood-fired since 1961', '#1f4d2e', '#fbf3e0', '700 64px Copperplate', 'neon', 'slice', '#e2533b'],
  ['DONUT KING', 'fresh every hour', '#ffe2ee', '#d8356f', '900 80px Futura', 'neon', 'donut', '#7a3fb0'],
  ['BURGER ROYALE', 'smash burgers · shakes', '#161311', '#ff9a3a', '900 76px Impact', 'neon', 'burger', '#ffd36a'],
  ['PRESSED', 'cold-pressed juice', '#c9e46b', '#1f3a18', '800 84px Avenir', 'paint', 'leaf', '#3d7a2c'],
  ['Le Petit Pain', 'boulangerie · pâtisserie', '#18233f', '#e9c983', 'italic 400 82px Didot', 'paint', 'wheat', '#e9c983'],
  ['NOODLE BAR', 'ramen · dumplings', '#1a0f10', '#ff4b3e', '800 78px Futura', 'neon', 'bowl', '#ffd07a'],
  ['THE GREEN BOWL', 'salads · grain bowls', '#eef3e6', '#2f6b3c', '700 64px Avenir', 'paint', 'leaf', '#8bbf4b'],
  // nightlife 10-17
  ['THE ADDER', 'live music nightly', '#060806', '#b8ff5a', '800 86px Futura', 'neon', 'snake', '#b8ff5a'],
  ['THE ROXIE', 'tonight · sold out', '#0b0b0b', '#ffe07a', '900 84px Georgia', 'neon', 'star', '#ff4f6d'],
  ['GO-GO HALL', 'dance club · 21+', '#0d0712', '#ff3b8b', '900 80px Impact', 'neon', 'bolt', '#39d2ff'],
  ['HALO ROOM', 'cocktails · vinyl', '#150c22', '#ffcf5a', 'italic 700 80px Georgia', 'neon', 'halo', '#ffcf5a'],
  ['LAUGH HOUSE', 'stand-up comedy · 7 nights', '#0c0c0c', '#ffffff', '900 72px Futura', 'neon', 'mic', '#ff5a3c'],
  ['MIDNIGHT', 'lounge · rooftop', '#0d1330', '#b58cff', '300 88px Avenir', 'neon', 'glass', '#6ee7ff'],
  ['VINO', 'wine bar · small plates', '#3b0f1a', '#f3c98b', 'italic 700 90px Didot', 'neon', 'wine', '#f3c98b'],
  ['NEON TIKI', 'rum · island drinks', '#081c1c', '#40f0c0', '900 76px Futura', 'neon', 'palm', '#ff8a3a'],
  // retail 18-27
  ['VINYL', 'records bought & sold', '#111111', '#ff5d8f', '900 96px Futura', 'neon', 'record', '#f6d25f'],
  ['PAGE & PALM', 'independent booksellers', '#233a5e', '#f4e7c5', '700 66px Baskerville', 'paint', 'book', '#f4e7c5'],
  ['MAISON NOIR', 'atelier · ready-to-wear', '#0a0a0a', '#f1ece2', '400 74px Didot', 'box', 'none', '#f1ece2'],
  ['SOLE SUPPLY', 'sneakers · limited drops', '#f5f5f2', '#111111', '900 76px Impact', 'box', 'bolt', '#e0452b'],
  ['Bloom', 'florist · weddings · events', '#fbeff2', '#c2426b', '400 96px "Snell Roundhand", "Brush Script MT", cursive', 'paint', 'flower', '#6c9a52'],
  ['OPTICS', 'eyewear · exams', '#ebe6dc', '#1d1d1d', '300 92px Avenir', 'paint', 'glasses', '#1d1d1d'],
  ['GOLDLEAF', 'fine jewelry', '#101010', '#d8b56a', '400 84px Copperplate', 'box', 'diamond', '#d8b56a'],
  ['GREEN CROSS', 'licensed dispensary', '#0f3a24', '#e9f7ea', '800 70px Futura', 'box', 'cross', '#39c26d'],
  ['RETRO THREADS', 'vintage · denim · tees', '#f0d9b5', '#8a3b1b', '900 64px Impact', 'paint', 'star', '#2f6f8f'],
  ['SUNSET SURF', 'boards · wetsuits', '#ff9e5e', '#20304a', '800 72px Futura', 'box', 'wave', '#ffffff'],
  // services 28-37
  ['BARBER', 'cuts · shaves · walk-ins', '#151515', '#f0f0f0', '900 90px Futura', 'box', 'pole', '#d0312d'],
  ['NAILS & SPA', 'manicure · pedicure', '#f7d8e2', '#8b2c55', '700 72px Avenir', 'box', 'flower', '#8b2c55'],
  ['IRON TEMPLE', 'strength · conditioning', '#1b1b1b', '#e8e8e8', '900 78px Impact', 'box', 'dumbbell', '#e0452b'],
  ['YOGA HOUSE', 'vinyasa · hot · restore', '#e7efe6', '#3f6b4f', '300 76px Avenir', 'paint', 'lotus', '#3f6b4f'],
  ['SPIN CYCLE', 'laundromat · wash & fold', '#2a6f97', '#ffffff', '800 74px Futura', 'box', 'washer', '#cfe8ff'],
  ['PACIFIC TRUST', 'bank · ATM inside', '#0f2440', '#ffffff', '700 64px Baskerville', 'box', 'columns', '#c9a65a'],
  ['PHARMACY', 'prescriptions · open 24h', '#f5f5f5', '#1a7a3c', '800 78px Futura', 'box', 'rx', '#1a7a3c'],
  ['INK & NEEDLE', 'tattoo · piercing', '#0d0d0d', '#e84a3a', '400 70px Copperplate', 'neon', 'star', '#e84a3a'],
  ['PAWS', 'veterinary clinic', '#fff5e0', '#3b6ea5', '900 92px Futura', 'paint', 'paw', '#e38b2c'],
  ['1-HR CLEANERS', 'dry cleaning · alterations', '#e9f1f7', '#16466b', '800 62px Futura', 'box', 'hanger', '#16466b'],
  // dealers 38-43 (the game's own marques)
  ['MARANELLO', 'of West Hollywood', '#b40d12', '#ffe23f', '800 84px Futura', 'box', 'shield', '#ffe23f'],
  ["SANT'AGATA", 'Sunset Boulevard', '#0b0b0b', '#d9b458', '400 82px Copperplate', 'box', 'shield', '#d9b458'],
  ['WOKING', 'motorcars · Beverly Hills', '#ff7a1a', '#101010', '700 88px Avenir', 'box', 'swoosh', '#101010'],
  ['GOODWOOD', 'Beverly Hills', '#101a2e', '#e4e7ec', '400 80px Didot', 'box', 'shield', '#e4e7ec'],
  ['MOLSHEIM', 'hypercars', '#0f2f6b', '#ffffff', '700 84px Futura', 'box', 'oval', '#c61f2e'],
  ['GAYDON', 'grand touring', '#0f3326', '#e9e2cf', '400 84px Baskerville', 'box', 'wings', '#e9e2cf'],
  // fuel, motel, hotel, cinema 44-47
  ['PACIFIC FUEL', 'regular · plus · premium', '#0c4a8c', '#ffffff', '900 72px Futura', 'box', 'drop', '#ffcc2a'],
  ['MOTEL CAPRI', 'vacancy · pool · color TV', '#10233a', '#ff4f4f', 'italic 900 70px Georgia', 'neon', 'star', '#5ee0ff'],
  ['THE SUNSET', 'hotel · rooftop pool', '#f4efe4', '#1f1f1f', '400 80px Didot', 'paint', 'sun', '#d08a3a'],
  ['CINEMA', 'now showing · 7 & 9:30', '#140a06', '#ffdd7a', '900 92px Impact', 'neon', 'star', '#ff5a3c'],
  // Beverly Hills and Downtown 48-55
  ['MERIDIAN BANK', 'los santerra', '#c8102e', '#ffffff', '900 80px Futura', 'box', 'maze', '#ffffff'],
  ['CASTELLANE', 'paris · rodeo drive', '#0c0c0c', '#d9b872', '400 84px Didot', 'box', 'none', '#d9b872'],
  ['AURELLE', 'maison de couture', '#f7f4ee', '#161616', '400 90px Didot', 'paint', 'none', '#161616'],
  ['VERANI', 'milano', '#f1ebe0', '#1f3a2c', '400 86px Copperplate', 'paint', 'none', '#1f3a2c'],
  ['HAUSER & FILS', 'horlogers · genève', '#14213d', '#efe3c4', '400 70px Baskerville', 'box', 'diamond', '#efe3c4'],
  ['THE BEVERLY CROWN', 'hotel · since 1928', '#153526', '#e2c47a', 'italic 400 64px Didot', 'box', 'crown', '#e2c47a'],
  ['CENTRAL MARKET', 'open daily · since 1917', '#1a0b08', '#ffcf4a', '900 64px Futura', 'neon', 'star', '#ff4b3e'],
  ['THE ORPHEON', 'tonight · live on stage', '#12080a', '#ffe7a0', '900 80px Georgia', 'neon', 'star', '#ff5a3c'],
  // Pasadena 56-57
  ['ARROYO BOWL', 'est. 1922 · pasadena', '#1f4a2e', '#f3ead2', '700 76px Copperplate', 'paint', 'none', '#f3ead2'],
  ['THE HARTLEY', 'library · art · gardens', '#f1ebdf', '#2b3a2a', '400 84px Didot', 'paint', 'leaf', '#4f7a3c'],
  // Exposition Park, Culver City, the Eastside 58-63
  ['COLISEUM', 'exposition park · 1923', '#f0e6cf', '#7a2a1c', '700 84px Copperplate', 'paint', 'none', '#7a2a1c'],
  ['NATURAL HISTORY', 'museum · exposition park', '#1d2f3f', '#efe4c8', '400 70px Baskerville', 'paint', 'leaf', '#c9a24a'],
  ['SANTERRA PICTURES', 'studio lot · stage 7', '#0f1d3a', '#f1d27a', '800 64px Futura', 'box', 'star', '#f1d27a'],
  ['PANADERÍA LA ESTRELLA', 'pan dulce · tamales', '#f7e7c1', '#b3261e', '800 60px Georgia', 'paint', 'star', '#1f6b3a'],
  ['MERCADO DEL SOL', 'carnicería · frutas · jugos', '#1f6b3a', '#fbe7a0', '900 70px Impact', 'box', 'sun', '#f2a33a'],
  ['JADE PALACE', 'dim sum · seafood · banquets', '#8e1414', '#f5d27a', '700 76px Georgia', 'box', 'halo', '#f5d27a'],
  // San Marino High School 64-65
  ['SAN MARINO HIGH SCHOOL', 'home of the titans · est. 1952', '#1d4fa0', '#ffffff', '700 58px Copperplate', 'paint', 'shield', '#ffffff'],
  ['TITANS', 'san marino high school', '#ffffff', '#1d4fa0', '900 92px Futura', 'paint', 'star', '#1d4fa0'],
];
export const SIGN = {
  food: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], club: [10, 11, 12, 13, 14, 15, 16, 17],
  retail: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27], service: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
  dealer: [38, 39, 40, 41, 42, 43], fuel: [44], motel: [45], hotel: [46], cinema: [47],
  bank: [48], luxury: [49, 50, 51, 52], grandHotel: [53], market: [54], theatre: [55],
  coliseum: [58], museum: [59], studio: [60], eastLA: [61, 62, 1, 0, 6], sgv: [63, 2, 8, 4, 30],
};
SIGN.shop = [...SIGN.food, ...SIGN.retail, ...SIGN.service];

/** Small emblems, drawn in a unit box centred at (0, 0), radius ~1. */
function emblem(x, kind, ink, accent, bg0 = '#000') {
  x.save(); x.lineWidth = .12; x.strokeStyle = ink; x.fillStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round';
  const P = () => x.beginPath();
  switch (kind) {
    case 'cup': P(); x.moveTo(-.6, -.3); x.lineTo(-.45, .6); x.lineTo(.45, .6); x.lineTo(.6, -.3); x.closePath(); x.fill(); P(); x.arc(.72, .1, .25, -Math.PI / 2, Math.PI / 2); x.stroke();
      x.strokeStyle = accent; P(); x.moveTo(-.2, -.5); x.quadraticCurveTo(0, -.8, -.1, -1); x.moveTo(.15, -.5); x.quadraticCurveTo(.35, -.8, .25, -1); x.stroke(); break;
    case 'sun': x.fillStyle = accent; P(); x.arc(0, 0, .45, 0, 7); x.fill(); x.strokeStyle = accent; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; P(); x.moveTo(Math.cos(a) * .6, Math.sin(a) * .6); x.lineTo(Math.cos(a) * .95, Math.sin(a) * .95); x.stroke(); } break;
    case 'wave': x.strokeStyle = accent; for (const o of [-.35, .05, .45]) { P(); for (let k = 0; k <= 20; k++) { const u = -1 + k / 10; x.lineTo(u, o + Math.sin(u * 4) * .15); } x.stroke(); } break;
    case 'slice': x.fillStyle = '#f2c14e'; P(); x.moveTo(0, .9); x.lineTo(-.7, -.6); x.quadraticCurveTo(0, -.95, .7, -.6); x.closePath(); x.fill(); x.fillStyle = accent; for (const [a, b] of [[-.2, -.3], [.2, -.1], [0, .3]]) { P(); x.arc(a, b, .12, 0, 7); x.fill(); } break;
    case 'donut': x.lineWidth = .35; x.strokeStyle = accent; P(); x.arc(0, 0, .6, 0, 7); x.stroke(); x.lineWidth = .14; x.strokeStyle = ink; P(); x.arc(0, 0, .6, 3.4, 6); x.stroke(); break;
    case 'burger': x.fillStyle = accent; P(); x.ellipse(0, -.35, .8, .35, 0, Math.PI, 0); x.fill(); x.fillStyle = ink; x.fillRect(-.8, -.25, 1.6, .22); x.fillStyle = '#6fbf4b'; x.fillRect(-.85, .02, 1.7, .12); x.fillStyle = accent; x.fillRect(-.8, .2, 1.6, .3); break;
    case 'leaf': x.fillStyle = accent; P(); x.moveTo(0, .9); x.quadraticCurveTo(-.9, 0, 0, -.9); x.quadraticCurveTo(.9, 0, 0, .9); x.fill(); x.strokeStyle = ink; P(); x.moveTo(0, .9); x.lineTo(0, -.7); x.stroke(); break;
    case 'wheat': x.strokeStyle = accent; P(); x.moveTo(0, .9); x.lineTo(0, -.9); x.stroke(); x.fillStyle = accent; for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { P(); x.ellipse(s * .22, -.6 + k * .35, .12, .24, s * .6, 0, 7); x.fill(); } break;
    case 'bowl': x.fillStyle = accent; P(); x.arc(0, -.1, .8, 0, Math.PI); x.fill(); x.strokeStyle = ink; P(); x.moveTo(-.2, -.2); x.lineTo(.5, -1); x.moveTo(.05, -.2); x.lineTo(.75, -.95); x.stroke(); break;
    case 'snake': x.strokeStyle = ink; x.lineWidth = .16; P(); for (let k = 0; k <= 30; k++) { const u = -1 + k / 15; x.lineTo(u, Math.sin(u * 5) * .35); } x.stroke(); P(); x.arc(1, .0, .14, 0, 7); x.fill(); break;
    case 'star': x.fillStyle = accent; P(); for (let k = 0; k < 10; k++) { const r = k % 2 ? .4 : .95, a = k / 10 * 6.283 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); break;
    case 'bolt': x.fillStyle = accent; P(); x.moveTo(.2, -.95); x.lineTo(-.5, .1); x.lineTo(-.02, .1); x.lineTo(-.25, .95); x.lineTo(.5, -.15); x.lineTo(.02, -.15); x.closePath(); x.fill(); break;
    case 'halo': x.strokeStyle = accent; x.lineWidth = .14; P(); x.ellipse(0, -.55, .6, .2, 0, 0, 7); x.stroke(); P(); x.arc(0, .25, .45, 0, 7); x.stroke(); break;
    case 'mic': x.fillStyle = ink; P(); x.ellipse(0, -.45, .3, .42, 0, 0, 7); x.fill(); x.strokeStyle = ink; P(); x.moveTo(0, 0); x.lineTo(0, .85); x.moveTo(-.35, .85); x.lineTo(.35, .85); x.stroke(); break;
    case 'glass': x.strokeStyle = accent; P(); x.moveTo(-.7, -.7); x.lineTo(.7, -.7); x.lineTo(0, .1); x.closePath(); x.stroke(); P(); x.moveTo(0, .1); x.lineTo(0, .8); x.moveTo(-.4, .8); x.lineTo(.4, .8); x.stroke(); break;
    case 'wine': x.fillStyle = accent; P(); x.arc(0, -.35, .45, 0, Math.PI); x.fill(); x.strokeStyle = accent; P(); x.arc(0, -.35, .45, Math.PI, 0); x.stroke(); P(); x.moveTo(0, .1); x.lineTo(0, .8); x.moveTo(-.35, .8); x.lineTo(.35, .8); x.stroke(); break;
    case 'palm': x.strokeStyle = accent; x.lineWidth = .14; P(); x.moveTo(0, .95); x.quadraticCurveTo(.15, .2, 0, -.5); x.stroke(); x.strokeStyle = ink; for (const a of [-2.6, -2, -1.2, -.5, .1]) { P(); x.moveTo(0, -.5); x.quadraticCurveTo(Math.cos(a) * .5, -.5 + Math.sin(a) * .5 - .2, Math.cos(a) * .9, -.5 + Math.sin(a) * .7 + .3); x.stroke(); } break;
    case 'record': x.fillStyle = ink; P(); x.arc(0, 0, .9, 0, 7); x.fill(); x.fillStyle = accent; P(); x.arc(0, 0, .32, 0, 7); x.fill(); break;
    case 'book': x.fillStyle = accent; P(); x.moveTo(0, -.5); x.quadraticCurveTo(-.5, -.8, -.95, -.6); x.lineTo(-.95, .6); x.quadraticCurveTo(-.5, .4, 0, .7); x.quadraticCurveTo(.5, .4, .95, .6); x.lineTo(.95, -.6); x.quadraticCurveTo(.5, -.8, 0, -.5); x.fill(); break;
    case 'flower': x.fillStyle = accent; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; P(); x.ellipse(Math.cos(a) * .42, Math.sin(a) * .42, .3, .18, a, 0, 7); x.fill(); } x.fillStyle = ink; P(); x.arc(0, 0, .2, 0, 7); x.fill(); break;
    case 'glasses': x.lineWidth = .14; P(); x.arc(-.45, 0, .35, 0, 7); x.stroke(); P(); x.arc(.45, 0, .35, 0, 7); x.stroke(); P(); x.moveTo(-.1, -.05); x.quadraticCurveTo(0, -.15, .1, -.05); x.stroke(); break;
    case 'diamond': x.strokeStyle = accent; P(); x.moveTo(-.8, -.25); x.lineTo(-.45, -.7); x.lineTo(.45, -.7); x.lineTo(.8, -.25); x.lineTo(0, .85); x.closePath(); x.moveTo(-.8, -.25); x.lineTo(.8, -.25); x.stroke(); break;
    case 'cross': x.fillStyle = accent; x.fillRect(-.28, -.85, .56, 1.7); x.fillRect(-.85, -.28, 1.7, .56); break;
    case 'pole': x.save(); x.beginPath(); x.rect(-.3, -.9, .6, 1.8); x.clip(); x.fillStyle = '#fff'; x.fillRect(-.3, -.9, .6, 1.8); for (let k = -4; k < 6; k++) { x.fillStyle = k % 2 ? accent : '#1f3f9a'; x.beginPath(); x.moveTo(-.3, k * .4 - .9); x.lineTo(.3, k * .4 - 1.2); x.lineTo(.3, k * .4 - 1.05); x.lineTo(-.3, k * .4 - .75); x.fill(); } x.restore(); break;
    case 'dumbbell': x.fillStyle = accent; x.fillRect(-.95, -.45, .3, .9); x.fillRect(.65, -.45, .3, .9); x.fillStyle = ink; x.fillRect(-.65, -.1, 1.3, .2); break;
    case 'lotus': x.fillStyle = accent; for (const a of [-.9, -.45, 0, .45, .9]) { x.save(); x.rotate(a); P(); x.ellipse(0, -.35, .18, .5, 0, 0, 7); x.fill(); x.restore(); } break;
    case 'washer': x.strokeRect(-.75, -.85, 1.5, 1.7); P(); x.arc(0, .15, .45, 0, 7); x.stroke(); x.fillStyle = accent; P(); x.arc(0, .15, .3, 0, 7); x.fill(); break;
    case 'columns': x.fillStyle = accent; P(); x.moveTo(-.95, -.4); x.lineTo(0, -.95); x.lineTo(.95, -.4); x.fill(); for (const u of [-.65, -.22, .22, .65]) x.fillRect(u - .09, -.3, .18, 1); x.fillRect(-.95, .75, 1.9, .15); break;
    case 'rx': x.font = '700 1.4px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = accent; x.fillText('Rx', 0, .1); break;
    case 'paw': x.fillStyle = accent; P(); x.ellipse(0, .35, .45, .38, 0, 0, 7); x.fill(); for (const [a, b] of [[-.55, -.2], [-.2, -.55], [.2, -.55], [.55, -.2]]) { P(); x.arc(a, b, .17, 0, 7); x.fill(); } break;
    case 'hanger': P(); x.moveTo(0, -.3); x.lineTo(-.9, .5); x.lineTo(.9, .5); x.closePath(); x.stroke(); P(); x.arc(0, -.55, .22, Math.PI * .8, Math.PI * 2.3); x.stroke(); break;
    case 'shield': x.fillStyle = accent; P(); x.moveTo(-.7, -.85); x.lineTo(.7, -.85); x.lineTo(.7, .1); x.quadraticCurveTo(.6, .7, 0, .95); x.quadraticCurveTo(-.6, .7, -.7, .1); x.closePath(); x.fill(); break;
    case 'swoosh': x.strokeStyle = accent; x.lineWidth = .2; P(); x.moveTo(-.9, .4); x.quadraticCurveTo(0, -.9, .95, -.2); x.stroke(); break;
    case 'oval': x.strokeStyle = accent; x.lineWidth = .16; P(); x.ellipse(0, 0, .9, .55, 0, 0, 7); x.stroke(); break;
    case 'wings': x.fillStyle = accent; for (const s of [-1, 1]) { P(); x.moveTo(0, 0); x.quadraticCurveTo(s * .6, -.6, s * 1, -.35); x.quadraticCurveTo(s * .6, -.1, s * .15, .15); x.fill(); } break;
    case 'maze': {                                                     // a square maze: the bank's mark
      x.fillStyle = accent; x.fillRect(-.9, -.9, 1.8, 1.8); x.strokeStyle = bg0; x.lineWidth = .16; x.lineCap = 'square';
      P(); x.moveTo(-.55, .9); x.lineTo(-.55, -.55); x.lineTo(.55, -.55); x.lineTo(.55, .3); x.moveTo(-.2, .9); x.lineTo(-.2, -.2); x.lineTo(.2, -.2); x.lineTo(.2, .55); x.lineTo(.9, .55); x.stroke(); break; }
    case 'crown': x.fillStyle = accent; P(); x.moveTo(-.9, .6); x.lineTo(-.9, -.4); x.lineTo(-.45, .05); x.lineTo(0, -.7); x.lineTo(.45, .05); x.lineTo(.9, -.4); x.lineTo(.9, .6); x.closePath(); x.fill(); break;
    case 'drop': x.fillStyle = accent; P(); x.moveTo(0, -.95); x.quadraticCurveTo(.75, .1, .5, .5); x.arc(0, .45, .5, 0, Math.PI); x.quadraticCurveTo(-.75, .1, 0, -.95); x.fill(); break;
    default: break;
  }
  x.restore();
}

export function signAtlas() {
  const W = 2048, H = ROWS * 128, w = W / COLS, h = H / ROWS;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const ctx = c.getContext('2d', {willReadFrequently: true}), mctx = m.getContext('2d');
  SIGNS.forEach(([name, tag, bg, ink, font, kind, icon, accent], i) => {
    const x0 = (i % COLS) * w, y0 = Math.floor(i / COLS) * h;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    // Board: a soft vertical gradient and a frame, so a lightbox has depth.
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, shade(bg, 1.12)); g.addColorStop(1, shade(bg, .86));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = kind === 'neon' ? accent : shade(bg, .6); ctx.lineWidth = kind === 'neon' ? 3 : 6;
    ctx.strokeRect(x0 + 5, y0 + 5, w - 10, h - 10);
    const hasIcon = icon !== 'none', ix = x0 + h * .55, left = hasIcon ? x0 + h * 1.05 : x0 + 22;
    if (hasIcon) {
      ctx.save(); ctx.translate(ix, y0 + h / 2); ctx.scale(h * .34, h * .34);
      if (kind === 'neon') { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
      emblem(ctx, icon, ink, accent, bg); ctx.restore();
    }
    // Name, scaled to fit, then the tagline.
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const size = parseFloat(font.match(/(\d+)px/)[1]), avail = x0 + w - 20 - left;
    ctx.font = font.replace(/\d+px/, Math.round(size * .62) + 'px');
    const scale = Math.min(1, avail / Math.max(1, ctx.measureText(name).width));
    ctx.font = font.replace(/\d+px/, Math.round(size * .62 * scale) + 'px');
    if (kind === 'neon') { ctx.shadowColor = ink; ctx.shadowBlur = 16; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeText(name, left, y0 + h * .6); }
    ctx.fillStyle = ink; ctx.fillText(name, left, y0 + h * .6); ctx.shadowBlur = 0;
    ctx.font = '600 15px Avenir, Helvetica, sans-serif'; ctx.fillStyle = kind === 'neon' ? accent : ink;
    ctx.globalAlpha = .85; ctx.fillText(tag.toUpperCase(), left + 2, y0 + h * .86, avail); ctx.globalAlpha = 1;
    ctx.restore();
    // Glow mask: neon glows where the ink and emblem are, a lightbox all over.
    const img = ctx.getImageData(x0, y0, w, h), d = img.data, hex = new T.Color(bg).getHex();
    const br = hex >> 16 & 255, bgG = hex >> 8 & 255, bb = hex & 255, out = mctx.createImageData(w, h), o = out.data;
    for (let k = 0; k < d.length; k += 4) {
      const diff = Math.abs(d[k] - br) + Math.abs(d[k + 1] - bgG) + Math.abs(d[k + 2] - bb);
      const glow = kind === 'paint' ? 0 : kind === 'box' ? .55 + .45 * Math.min(1, diff / 160) : Math.min(1, diff / 110);
      o[k] = o[k + 1] = o[k + 2] = Math.round(glow * 255); o[k + 3] = 255;
    }
    mctx.putImageData(out, x0, y0);
  });
  const t = new T.CanvasTexture(c), mt = new T.CanvasTexture(m);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; mt.anisotropy = 8;
  return {color: t, glow: mt};
}
function shade(hex, k) {
  const c = new T.Color(hex).getHex(), f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(c >> 16 & 255)},${f(c >> 8 & 255)},${f(c & 255)})`;
}
