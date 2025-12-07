/**
 * Cleanup script to remove orphaned Google Calendar events
 *
 * SAFETY: This script only deletes events that:
 * 1. Were created by Koordie (identified by description patterns)
 * 2. Do NOT have a corresponding record in the production database
 *
 * This ensures we never delete events that are actively being used.
 *
 * Run with:
 * ENCRYPTION_KEY="..." DATABASE_URL="postgresql://..." npx ts-node src/scripts/cleanupOrphanedGoogleCalendarEvents.ts <user_email>
 */

import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

// Active Google Event IDs from production - these must NOT be deleted
const PRODUCTION_EVENT_IDS = new Set([
  'vebgdbt34t87ee6mv9u44djfi4',
  'hqkvhl9jhonj3glra36jo3u250',
  'ukbhovthsdofum11daf7aqai8g',
  'slk8vsi9reb04k791jgpnpapik',
  'f60kgndbci72kdp9ikq6qvfsc0',
  'rr58aau4ahcvtrhn2aahjobro4',
  '8oi7r0gqu1foipbcr757287hs8',
  '72klvkmgtui3in3j21ctehjdu4',
  'kj0mqdnfhvv78odirusmvpfik8',
  'g2n9qms9m8tfr5m1252butd03s',
  '9e5j0ernlv65hlrmjmb3jjieac',
  'sihounsq2e45j4oqs5gqnhe310',
  'efj4uun688u1c4ls2odgafla9c',
  'ostu2li7m3etq3ffqlof062qbo',
  '422mdeuvanjr68cj8raqn1an80',
  'nh799ogscd5ucotl7piltv2mh0',
  '6a45titbsea8di27a5rbaplseg',
  'n87bubg6c3r0grmihvc094p0gc',
  'r2ajpji9qdb0gb64svr61eh6c8',
  'j9vkmc2kb25qjb35qs7islqek8',
  'u8f36n51llcmtdo30jd16vut4o',
  'ljc9ugeln7p8s90u56tmua6t7g',
  'mqbdhphfgkeodfu3rdu0ua8mek',
  '2ikpucg743vii3b61n38b6l45s',
  'oo9b3aup0kgl8svotl63tvu4uk',
  '3499t50jm8mu84tuldvt61dnqs',
  'f604bgf70ad5jkfsrn3q51j724',
  'kaj5d9eti2g0o43m74cf6nl2h0',
  '5ln89t84si6eonp4gpgh9o5f24',
  'iatajqh5j864ujko1bo252gohc',
  'm8v9n57915bdgob372fgu563tc',
  'u1c08lfjgg1c7061s7c712s0tk',
  'p8q0ijmel12fqah3j4nitnsrv0',
  '026j9krj9map533202mmgesd6g',
  '6vtdqqst0kkdgl071t6fp22dik',
  'q6oqev8voho8v4co2nro2c9pd0',
  'qq8kn3492pudvudehnoh7bcvck',
  't6n8k8ljbiogvhggk8o6hq1ch8',
  'h9k7h6tb2amuiklisdcqj3u7ek',
  'fqnj77ug6b1cm96v69hn0q44gg',
  'k6hqfblq13oi74pbm9ec2ffvrs',
  '3s6om4spdpeoqlifc01ocb44vg',
  '8vh284a2jo9dhl4f3apicdks0c',
  '45nm6d72jve5423oklgavqv13c',
  'nqhhskvml5lkdqffdcbktdlje8',
  'vm0q073hcikucti54phc3romlg',
  'g1uh5rdvvf9sojjdtktff4as90',
  'aiiq96s8203cr0ouk9fdt5lkhs',
  'lbf0odcqmfujcaauiof8hmbabc',
  'd3tr9a76dl1ue3v6a18rmsub0s',
  'r9tfqqglpd69g58ahq68q4f8k8',
  '6d5qurkcitsahr5mckni8j0rlk',
  'adkjde819vtqgihfn23oi9p3ag',
  'ivpvvld1ehk02g1255d1cogf4s',
  '4ltagvaaqdcma7th7gpq4lnp38',
  'uivdsnemp5pn191k3g5umuq46s',
  'af6lrvb8gmdha223dgrlhr6ksc',
  't0h0g1v38eqoqvko8jumfbj61c',
  'd0mbdiqj97ijs5ddbkqfuhmv58',
  '26fbu85n2eu4k90au3jq2ia7qk',
  '4k4370qo8h3692138dhg2jp6mg',
  '6mmskvtncggmpq4862m4qcni0s',
  'nrhajqt46cqh6a1v8mri82lii8',
  '7ivilg65ep7k94keca8bsa6p3o',
  'r4q4704ir50rd8f74l40672ts8',
  'ktt6s3ivfqbej4h4kqcgot36t4',
  '6okgfi1lvll5867udhdtli7bvg',
  'oofa9cd9es0e7v7rpblvhouvj8',
  'dpklq0933pjkn11cvjadgte0ds',
  'nmaejukig237eiccmd7am3o0io',
  'ir0rt1vn9hh49vmckekr9oe86k',
  'kqofq5dc011vumjk5e34vbnopc',
  'e397gp4lqaep00kdvltghmdnn8',
  'nhhc5bkrdoc7aee2vudsv67bkg',
  'isa1tdvc176u9l8jkv3fvpo9b8',
  'q6qr8md1coafebo5ukblelgsck',
  '8ulm4607pu7omsi2jie3f1kjsg',
  '24trbevg6g8p6u4jgo1v76sm58',
  'ak66je45tu2vodmrekudh040u0',
  'pbgm7bf8hepm47buokvmbopk3s',
  '86ivskjhl6v4m3b4sel98q02b8',
  'hmt9mp1cplj6d4qa01vik5o94g',
  'tmj8oe7vn6hi73vndke8o6rd6c',
  '0b8s39gud5af0t40rt14bpbd18',
  'u4f2bbsqastrot683idadldgns',
  'g4qto14nfeij3l4j6nh4qnpelo',
  'u5dag75pdp515h5v2q61unmbmc',
  '38ufsbpaurq4579crrjgn3vdco',
  'b7gq3ho36i3h75uh9k2elfbtvc',
  'v27oloebonsuq20mbilvdvf278',
  '0ha05jafsael1qsqrb4mma9u0k',
  'k1gs0u0e2k2h121d74agj6s8nk',
  'pe7ddt0bqorjqgg9u6ou8eevc8',
  '9csl61lnf2h3vn513u72o6rlfg',
  '49k71jk0iqf8iqmpsm4t8l8ups',
  'pme8mpr94tkdd0vug82o8uesvg',
  'armv6gldjooik06fuoep90ial0',
  'mpdgpk4ievqdfhdhbcthtc4vmk',
  '2cd3lsn4bp0t63vqk2rruq2jcs',
  'a3jcb9jmp9gaa18kvkifd19ic8',
  'mecbg8j8dao9v6v0789j40t684',
  '4i5700ekjt2ae91nvmsad1ec3s',
  'q0erq1h73mtivliq58hve4gu9k',
  'kur7gp77qq3p5k1ta2oql4htv0',
  'nl904jirf4pgb9jitjhedagcfc',
  'k98fntj6uf3usgqmg8hh6aeg0c',
  'csj9qif7885bo2sqs1sd7t0ja4',
  'aierpgg4h42624rt075d1n5uqc',
  'nd44n0d6aqu3fsv7ii0dqau3ug',
  'tg4mu5gfu896ro7ji0clvjjk9k',
  'cimjgdr7ednufmtpfr72fhnpbo',
  'r9ous5ur1dlvv9j4ocie4r5090',
  'simbcvdhei34ti1bj6f8i1ega0',
  'p2n3es42o1k34baratfuu8pa30',
  '40nsdth698f2pgaakaebf0n0m8',
  '3gjupkl3r6gkv2i7ar9olgi1k0',
  'fpae9bqmtts8n1mdnqoqg1ftns',
  '5ic6kq8d71kbh1tpnu8f1jac84',
  'g980oacfkcvngp2qeib1b91bm0',
  'k250hefim8tlbuq2ic147g6d50',
  'ej1mpa3erqqcoprj1peap8hu0c',
  '7ia2fd4lvmejm0i8o0hse209k8',
  '360nu143mnp2b4p3jj9schfrqk',
  '34tr3vj6jeuf42bo6th7v1i3i4',
  'lnmqv12gm3msovtlo8m1vju6bs',
  'hjugto0fvvh8sbij1n9c20oess',
  'tr7rn6eeeb1d64il2tlljlho2k',
  'k25rll6oncnlnqg6qma0f2jfck',
  '226v19jfivpu4i8dm5ofkmav6g',
  'm4j7imuhjsltnd68a7dhf39l14',
  'p686bt9e7jjrrf21c1jouaove4',
  'duv32b3uiqc5ul3rjfun680o54',
  'rrhnpig8lo1kn30gecfmbdvsn8',
  'a7ju6o0t05gj71q6o9o89i80rg',
  'gcdu678eu0g5c1ojhsikpq3sck',
  'fveehierhlnvqiglhqf98nd6ic',
  '6v181k0edg8lfumbfa6d5ltg3c',
  '89so8gnj71caq1lara3jjvatak',
  'sq0becf8gibntmcisktr7mcmos',
  '2igs1esksrc34c6k3vkpfsp6t4',
  'dhpjeku6a7tde94v4ecslkl9io',
  'ri9gm1sfon9bdvj59fsgdi7qmc',
  'b273bfkt7majsf460ps123pp08',
  'r1ftuk7nb8cfbbh7tb86ee3kic',
  '01j7cchct17m1bifoegpecc1jc',
  'qipd376a64u2l0brj08skt3bkk',
  'e6ddr2em5i98hqfq243m0doago',
  '8aruursm712tadl6hinr8m63r8',
  '6282sf3vf5uhq99rse5squantk',
  '9n207ih3cq4aa73f0jtp3l2234',
  '798i0h4t20nocss49n8h3vv3ko',
  'mr3lft1jou8l6s70mcejcrape0',
  'kki9dnqu5aud5fmudcqibspqho',
  'cv60urap5acs8f73tcqjapn34s',
  'eqeuknf7381vfo1pd28ajivm8s',
  'hial1pr9fm2u58iffi22bdc28c',
  'ort7il7fts9k9tk773akimc238',
  'c8ih55e9g4c5hp7dnb04ekn7h4',
  '63hmgic9k4uaf8890ho68c7jh8',
  'p182ttorvd78sr69jbqru939d8',
  'ommjh5fods3bua4jjepgio96rc',
  'v7r5oc6lvone6p7cu58elkb29o',
  '43fve63qcc0cutmf9tq3l0eaeo',
  '6id0hd6fekvornfoc33ameqhvk',
  'rrqjvgr4utjdddcd18b5rjl8f0',
  'qrqp6ds1749uisccu7hh7sgi2s',
  'e8atu52sdo0o88lu5fo5p06mm0',
  'rql49asgnkp2pmjigoe8pfccrk',
  'boplqufb43mbl2ka80pl8ies84',
  'kd68bn99ne1s2jg20o9ki2s4go',
  'rn2ie3m9v9uec64ujptgnn919o',
  '4i6oqaj4p0m7etb9jstsju2gk8',
  'poudgb8bfljccp1cfo1mnnlo2s',
  '9oie3493ri6gtd4g3jn3jepouo',
  'udcs0jnudv23ueenhnvlvuksj8',
  'vfed1s725sthud0hhrcfd87s3o',
  '2fou3skebvg95euoh6mg1erslo',
  'r69agmchn4db61k7at9irkfteo',
  'd88kpcb7bq5s7h6t6qgoj0ctik',
  '4ungk9aftqilbe20p83d2gfa9s',
  '9eng6t18gqabgngpld7fio0tss',
  '023j8798skvt0eot76l4kedja0',
  '37403fuq4uf64nhshkd1tp3vkk',
  'icup4cjf7pl2kjt1tr92b201a4',
  '41r7353cceade0gegmi5e87u6g',
  '90n2t2j9pvut0cl89veguof4q4',
  'emvccfjfr61a0ndeb5t7t8l2l4',
  'mkhkbt0lpqb0pgmoq4jdmb648k',
  'hra7veeg2duc8jheedb9jkclns',
  'qfi2g80qkh22jd27fq2i7tbr5g',
  '974qq0q2d8ms481fpri7vqk808',
  '83mkuh4u9u8dsrkhngn368l2sg',
  'k05ugrbbk911nn63d8nmkt0ha8',
  '59i1l9kibnfq5h9t0lsfmb9lc0',
  'b1aa6g77mncuqhhi84e0an7ulk',
  '11n238ik766gbq4mmpb9adeflc',
  'gcufk3ru3hi682ciabupk0qg6c',
  'g4gff8fdrt8b28n7erv2f16jj4',
  'pgld2el0hel6ecpfr9bug5p5u8',
  '27p6o5mo2lo24i0ig36c9sum8c',
  '837ifkjf0oaig003m9793b2fh8',
  '4iq6jcjlmhfhjap39or2a2tdlg',
  '0n4tvsu7u47qqu5kb6j1gvr6v4',
  'e3ad4s64h11j9cccccmpa8dgf0',
  'suha0ckek89jvf18mv7ruq3sek',
  'p6eblsib2kknsgkns88to8p4fs',
  '01n50vcv8f07kt942reeaacajs',
  'ubvad23kss4irr265d06keu33s',
  '6fskgs3lenrv6k9s8630tsu7js',
  '0knhqgjhhkbrebivvmhv63k1gk',
  'fhb4r2eahlffd8trvq805q3qqs',
  'ao05nl1ljr922f8a87smuigvik',
  'o4i3qiup1q5qr0oce9vclpqveg',
  'qbi8o3qba6ph5fsus29q8o7p0o',
  '608nn1eq5hfhamqimh89450660',
  'f9nmn9l7h6kt64lp4hdg8mj6cs',
  'b2g3q5b7qm63drhpsbk1ip06mk',
  'k4k3cudav95t09h0c0k3kvo070',
  'tbfqakt10ovnvgn8818ed9bkl4',
  '4snvptsb0i5fktlkr724bh0e3k',
  'qef5ptt943dskd1mn34enscjkk',
  'moclgr1gn0s5l748rc986ptte8',
  'bqh3ef7ghq9dn9qa3kg5nk86fo',
  '7phil8sr6trs6qemk3ir5u21vs',
  '9pgurdk8sus49mrgm19euom29s',
  '8s6pc6i864m5m8letaiuat28u8',
  'cmvpk30s9k4gjpfskse2q9ntls',
  'mqeuu2vn02glldce0dv6fa2fts',
  '7s9c7aub61fcdco4b8jlr2icgs',
  'agq2lqk0ih1juepeeonthmjepo',
  'spvb0q1etnogs7u5f36c3j9cps',
  'hfq43vip6jljqhh4s4gh19s3ek',
  '3ovcp1omkc1iikorr0bh4anlh8',
  'vlof7ak0md1tsp1n98ejkk3or8',
  '11kbajbivjtb2u8p2088csk9jc',
  'ec6cr3j8h4afhm3itj8dbghum0',
  'mls9eqk5oispv397nchoi3n7p4',
  'oeadv3mic05fvdhas63u4sdeao',
  's2g6ru7970ej5lj9m97kvml7uc',
  'dj7a1eb16rieqon5atsu4o98qg',
  '8a7mvof2l8ogqd5tqp6mlv157g',
  'un9pv96q4d0cickqfncff79v28',
  'nmbl474nvnon8gbc43j6hbf8e8',
  'mvv9tfq0njr18mpcnepoc2s5pg',
  'brvqnn6rss3d38id2jihr5vsos',
  '87qmouvhqd58rpuclfrvqikmeo',
  'cimuhochtqjmgq7h3ug68g1erg',
  '0k8m2bd9junu422i3003rlrgsk',
  '7fr2sd1k81rgodaejg0ce4r410',
  'm1bljpv9ob9htulbjaske494ik',
  'agtq029c26m1jcb9onkoedu5ts',
  '2c501ghlm34hgilt734ugq99r8',
  '7uslq2spqdbm9efj6pp5h7kf20',
  '6pumgs93ailmf3v9gtsf72c184',
  '1b8g7dvhn5q1eda8o4f4obnekg',
  'c6ji9lp73a95a3ic4r7beve2ls',
  '40kio3qf60edvu96td306pue1s',
  'jn8qrfof25lcfobnigqih239ic',
  'oiptmb10vddd6d231t3i0ihu10',
  'sqj9p4a25n2cf0bov474m6qeco',
  'i3pn8r7vq1645ugdm35n5j2nk0',
  '4o6bncai4uhvf62gc0gk562s1o',
  'oem6js56en4bcbi6ctduubdjb4',
  'e83blppr185s54jb5a5laev8i4',
  'onmqgsaecbt148i9ekk31gmpjg',
  '6sbdr264si1tq1gsbj75sp1s78',
  '93ubnprq7fdl38p8c9k9mfmri0',
  'qogfrtlpjg6e83bfccq83ei090',
  '626tgfab6u5r2ssghkabqu718o',
  'iqpnh93pqrflbgap2t3dbf4lak',
  'esqkb8sj7sfcfank0anl4l5fi4',
  '8braa6678pfset2m579sb3gab0',
  '1qeuh625tcdmlvibu9ki72l3cc',
  'rgck16ckhb21knduahof86ari0',
  'tocrc02894gmd4j47i30o293og',
  'vuk13uf97qiri2d9i056jk2tm0',
  '65v32b68o04dgneponupepdskg',
  'q63cblfjugf4v3402tlcb6k62g',
  'n1uocvq7hjcd0ti9iuuh5hh5dk',
  'n8ivsjssb9dvol6o881vbefu00',
  '6tuc33vt4b2l0809j7fsl8r3bs',
  '8cp6uj02ejbilif760c2ef77fc',
  '5vb3lplprc5hkp9qrcslt1451s',
  '2nfmrsjhd5dhf8tre2q4cc9c2g',
  'onamhbisioreblat1vanj3tcf4',
  'steaf7hfmv01k67fgrd4b5mcsc',
  'k43if8vnf589a23trv6hq4oofk',
  'b2t3h13rnfq3n7mdgqtmbl346s',
  '0m0a453mgpi3l7ie9kqdhvcb3k',
  'vh7iffsh2ip6asma3h6ptada50',
  'iq3scjfimkmbesp9vqqhn1hj0c',
  '2v0ftjiit5ojbpk75g8ukej1pc',
  'igk0nfu6nrddi21mg07uo2ni40',
  '11na69rfktm7e13okok6e7rl7s',
  'vams1kmfn6tfvb5mm6hr9a3pok',
  'u529n1ie3abo2geao9jf982tms',
  'iacf6hqt3icka0bk3vippoiprc',
  '4fj3au53p1tam7sfaf6dd4p764',
  '8apuoej1u93404fi3e952i0rlo',
  'mhe5vdlg837jn2vbd9fohcjdgs',
  'dth6bufjdui13cq9qor6f6sbrs',
  '1sed925hj7auetjn0e8f9qojog',
  'ptc0k46e19bin8ts2h06qvhba0',
  'isef39ourp7ti93tck3m84imqg',
  '57drhbir0pm02alq2f085c0hvg',
  'v2qi3anpiqjnmcogdcbndo6u4c',
  '8l72pqur2m3bib3qa4j944bauc',
  'h5apfrmt0qsqmb667paorpdhvk',
  'mt76pfgojhg2ppken06e5o39ec',
  'v3t0njttfoi65lqnqb6t6fh3j4',
  'uldop6cqud3a4b0ofnmk8c8fsk',
  '090g99na154e7slvknp61iet08',
  '1lgvvjf4nuq3j64b8ufhbk0p94',
]);

// Patterns that identify Koordie-created events
const KOORDIE_PATTERNS = [
  '❓ Unassigned',
  '✅',
  'Child:',
  'Drive time for:',
  'Early arrival for:',
  'Origin:',
  'Destination:',
];

function isKoordieEvent(event: any): boolean {
  const summary = event.summary || '';
  const description = event.description || '';

  // Check summary patterns
  if (summary.includes('❓ Unassigned') || summary.includes('✅')) {
    return true;
  }

  // Check description patterns
  for (const pattern of KOORDIE_PATTERNS) {
    if (description.includes(pattern)) {
      return true;
    }
  }

  return false;
}

async function cleanupOrphanedEvents(userEmail: string) {
  console.log(`\n🔍 Starting cleanup for user: ${userEmail}\n`);
  console.log(`📊 Production database has ${PRODUCTION_EVENT_IDS.size} active event IDs\n`);

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      google_calendar_id: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userEmail}`);
  }

  if (!user.google_calendar_sync_enabled) {
    throw new Error(`Google Calendar sync not enabled for user: ${userEmail}`);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);

  // Get Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  console.log(`📅 Using calendar: ${calendarId}\n`);

  // List all events from the calendar (past year to next year)
  const now = new Date();
  const timeMin = new Date(now.getFullYear() - 1, 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();

  console.log(`🔎 Searching events from ${timeMin} to ${timeMax}...\n`);

  let allEvents: any[] = [];
  let pageToken: string | undefined;

  do {
    const response: any = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults: 2500,
      singleEvents: true,
      pageToken,
    });

    if (response.data.items) {
      allEvents = allEvents.concat(response.data.items);
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);

  console.log(`📋 Found ${allEvents.length} total events in calendar\n`);

  // Filter to Koordie events
  const koordieEvents = allEvents.filter(isKoordieEvent);
  console.log(`🏷️  Found ${koordieEvents.length} Koordie-created events\n`);

  // Find orphaned events (not in production)
  const orphanedEvents = koordieEvents.filter(event => !PRODUCTION_EVENT_IDS.has(event.id));
  console.log(`🗑️  Found ${orphanedEvents.length} ORPHANED events to delete\n`);

  if (orphanedEvents.length === 0) {
    console.log('✨ No orphaned events to clean up. Done!');
    return;
  }

  // List orphaned events
  console.log('Events to be deleted:');
  console.log('─'.repeat(80));
  for (const event of orphanedEvents) {
    const start = event.start?.dateTime || event.start?.date || 'unknown';
    console.log(`  - "${event.summary}" (${start})`);
    console.log(`    ID: ${event.id}`);
  }
  console.log('─'.repeat(80));

  // Confirm with DRY_RUN check
  const isDryRun = process.env.DRY_RUN !== 'false';

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - No events will be deleted');
    console.log('To actually delete, run with: DRY_RUN=false');
    return;
  }

  console.log('\n🗑️  Deleting orphaned events...\n');

  let deleted = 0;
  let failed = 0;

  for (const event of orphanedEvents) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId: event.id,
      });
      console.log(`  ✅ Deleted: "${event.summary}"`);
      deleted++;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log(`  ⚠️  Already deleted: "${event.summary}"`);
        deleted++;
      } else {
        console.error(`  ❌ Failed: "${event.summary}" - ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✨ Cleanup complete!`);
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Failed: ${failed}`);
}

// Main execution
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('Usage: npx ts-node src/scripts/cleanupOrphanedGoogleCalendarEvents.ts <user_email>');
  process.exit(1);
}

cleanupOrphanedEvents(userEmail)
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
