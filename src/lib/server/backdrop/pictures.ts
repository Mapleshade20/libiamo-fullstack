/*
 * The pictures behind the home page and the scene card, by hand: each a file on Wikimedia Commons, public domain or
 * CC0 only. `scripts/backdrops.ts` downloads what is missing into src/lib/assets/backdrops (WebP at 1600 and 800 pixels
 * wide, and meta.json: size, colour, licence); `today.ts` picks the learner's picture of the day from them. An `id` is
 * the asset's name: change it and the script downloads the picture again.
 */

/** Old prints, printed into the paper along the bottom of the page. `bottom` and `zoom` push the plate's edge and caption
 * past the page's edges; `ink` lightens one darker than the rest. Most are from one series (Diverses paisages,
 * Rijksmuseum), so the days change the picture, not the hand. */
export const PRINTS: readonly Print[] = [
	{
		id: "rembrandt-the-goldweighers-field",
		file: "Rembrandt_van_Rijn,_Landscape_with_a_View_toward_Haarlem_(The_Goldweigher's_Field),_1651,_NGA_35129.jpg",
		bottom: 3,
		zoom: 1.05,
		credit: "Rembrandt, The Goldweigher's Field, 1651 (NGA, CC0)",
	},
	{
		id: "windmill-in-a-flat-landscape",
		file: "Windmolen_in_vlak_landschap_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.045.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Windmill in a flat landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "coast-with-ships",
		file: "Kustlandschap_met_schepen_voor_kust_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.043.jpg",
		bottom: 27,
		zoom: 1.1,
		credit: "Coast with ships, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "shepherdesses-crossing-a-river-with-their-flock",
		file: "Boerinnen_steken_met_kudde_rivier_over_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.037.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Shepherdesses crossing a river with their flock, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "coast-with-boats-drawn-up-on-the-shore",
		file: "Kustlandschap_met_boten_op_de_kant_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.042.jpg",
		bottom: 25,
		zoom: 1.1,
		credit: "Coast with boats drawn up on the shore, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "landscape-with-a-bridge",
		file: "Landschap_met_brug_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.029.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Landscape with a bridge, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "landscape-with-a-stag-hunt",
		file: "Landschap_met_hertenjacht_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.040.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Landscape with a stag hunt, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "landscape-with-an-angler-a-tree-and-riders",
		file: "Landschap_met_visser,_boom_en_ruiters_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.041.jpg",
		bottom: 23,
		zoom: 1.1,
		credit: "Landscape with an angler, a tree and riders, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "shepherdess-spinning-with-her-flock",
		file: "Spinnende_herderin_met_kudde_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.046.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Shepherdess spinning with her flock, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "draughtsman-and-shepherd-in-a-landscape",
		file: "Tekenaar_en_herder_in_landschap_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.047.jpg",
		bottom: 28,
		zoom: 1.1,
		credit: "Draughtsman and shepherd in a landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "two-riders-galloping-through-a-landscape",
		file: "Twee_galopperende_ruiters_in_een_landschap_Verschillende_landschappen_(serietitel)_Diverses_paisages_(serietitel),_RP-P-OB-35.044.jpg",
		bottom: 31,
		zoom: 1.1,
		credit: "Two riders galloping through a landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		id: "rembrandt-landscape-with-a-cottage-and-haybarn",
		file: "Rembrandt_van_Rijn_-_Landscape_with_a_Cottage_and_Haybarn.jpg",
		bottom: 9,
		zoom: 1.04,
		ink: 0.7,
		credit: "Rembrandt, Landscape with a Cottage and Haybarn, 1641 (public domain)",
	},
];

/** Paintings: landscapes in colour, light and quiet, of many kinds (orchards, fields, villages, snow, a few shores), laid
 * faintly over the whole page in the light theme. `x` and `fy` are where the interest lies across and down (per cent),
 * kept in view when the screen's shape crops it. Found on landscapes.directory and Wikimedia Commons. */
export const PAINTINGS: readonly Painting[] = [
	{
		id: "thomas-moran-near-east-hampton-long-island",
		file: "Thomas_moran_near_east_hampton_long_island093746).jpg",
		x: 30,
		fy: 50,
		credit: "Thomas Moran, Near East Hampton, Long Island, 1894 (public domain)",
	},
	{
		id: "albert-marquet-les-toits-douchy-et-le-leman",
		file: "Albert_marquet_les_toits_douchy_et_le_leman.jpg",
		x: 50,
		fy: 40,
		credit: "Albert Marquet, Les toits d'Ouchy et le Léman, 1936 (public domain)",
	},
	{
		id: "camille-pissarro-the-orchard",
		file: "Camille_Pissarro,_Le_verger_(The_Orchard),_1872.jpg",
		x: 45,
		fy: 50,
		credit: "Camille Pissarro, The Orchard, 1872 (public domain)",
	},
	{
		id: "camille-pissarro-the-garden-at-eragny",
		file: "Camille_Pissarro_-_Le_jardin_à_Éragny.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, The Garden at Éragny, c. 1895 (public domain)",
	},
	{
		id: "alfred-sisley-louveciennes-in-the-snow",
		file: "'Louveciennes_in_the_Snow'_by_Alfred_Sisley,_Norton_Simon_Museum.JPG",
		x: 50,
		fy: 65,
		credit: "Alfred Sisley, Louveciennes in the Snow, c. 1874 (public domain)",
	},
	{
		id: "alfred-sisley-first-snow-at-veneux-nadon",
		file: "Alfred_Sisley,_First_Snow_at_Veneux-Nadon,_1878,_NGA_62641.jpg",
		x: 60,
		fy: 55,
		credit: "Alfred Sisley, First Snow at Veneux-Nadon, 1878 (NGA, CC0)",
	},
	{
		id: "alfred-sisley-moret-sur-loing",
		file: "Alfred_Sisley_-_Moret-sur-Loing_(1891).jpg",
		x: 60,
		fy: 42,
		credit: "Alfred Sisley, Moret-sur-Loing, 1891 (public domain)",
	},
	{
		id: "alfred-sisley-on-the-hills-of-moret-in-spring-morning",
		file: "1880,_Sisley,_On_the_Hills_of_Moret_in_the_Spring_-_Morning.jpg",
		x: 55,
		fy: 35,
		credit: "Alfred Sisley, On the Hills of Moret in Spring, Morning, 1880 (public domain)",
	},
	{
		id: "claude-monet-haystacks-end-of-summer",
		file: "Claude_Monet_-_Haystacks,_end_of_Summer_-_Google_Art_Project.jpg",
		x: 55,
		fy: 55,
		credit: "Claude Monet, Haystacks, End of Summer, 1891 (public domain)",
	},
	{
		id: "claude-monet-meadow-at-giverny",
		file: "Claude_Monet_-_Meadow_at_Giverny_(Princeton).jpg",
		x: 55,
		fy: 50,
		credit: "Claude Monet, Meadow at Giverny (public domain)",
	},
	{
		id: "claude-monet-poppy-field",
		file: "Claude_Monet_-_Poppy_Field_(Giverny)_-_1922.4465_-_Art_Institute_of_Chicago.jpg",
		x: 50,
		fy: 55,
		credit: "Claude Monet, Poppy Field (Giverny), 1890 (public domain)",
	},
	{
		id: "vilhelm-hammershoi-landscape-view-from-lejre",
		file: "Vilhelm_Hammershøi_-_Landscape,_view_from_Lejre.jpg",
		x: 50,
		fy: 40,
		credit: "Vilhelm Hammershøi, Landscape, View from Lejre (public domain)",
	},
	{
		id: "paul-cezanne-landscape",
		file: "Paul_Cézanne_-_Landscape_-_Google_Art_Project.jpg",
		x: 50,
		fy: 55,
		credit: "Paul Cézanne, Landscape (public domain)",
	},
	{
		id: "vincent-van-gogh-the-white-orchard",
		file: "Vincent_van_Gogh_-_The_white_orchard_-_Google_Art_Project.jpg",
		x: 50,
		fy: 45,
		credit: "Vincent van Gogh, The White Orchard, 1888 (public domain)",
	},
	{
		id: "camille-pissarro-boulevard-montmartre-spring",
		file: "Camille_Pissarro_-_Boulevard_Montmartre,_Spring_-_Google_Art_Project.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, Boulevard Montmartre, Spring, 1897 (public domain)",
	},
	{
		id: "camille-pissarro-view-from-louveciennes",
		file: "Camille_Pissarro_-_View_from_Louveciennes_-_National_Gallery_London.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, View from Louveciennes, c. 1870 (public domain)",
	},
	{
		id: "armand-guillaumin-landscape",
		file: "Jean-Baptiste-Armand_Guillaumin,_Landscape,_1882,_NGA_48203.jpg",
		x: 50,
		fy: 55,
		credit: "Armand Guillaumin, Landscape, 1882 (NGA, CC0)",
	},
	{ id: "berthe-morisot-bougival", file: "Morisot_-_Bougival,_1884.jpg", x: 55, fy: 40, credit: "Berthe Morisot, Bougival, 1884 (public domain)" },
	{
		id: "ivan-shishkin-rye",
		file: "Ivan_Ivanovich_Shishkin_-_Rye_field,_1878.jpg",
		x: 55,
		fy: 55,
		credit: "Ivan Shishkin, Rye, 1878 (public domain)",
	},
	{
		id: "john-frederick-kensett-almys-pond-newport",
		file: "John_Frederick_Kensett_-_Almy's_Pond,_Newport,_Rhode_Island_(1859).jpg",
		x: 65,
		fy: 60,
		credit: "John Frederick Kensett, Almy's Pond, Newport, 1859 (public domain)",
	},
	{
		id: "martin-johnson-heade-newburyport-meadows",
		file: "Martin_Johnson_Heade_-_Newburyport_Meadows_ATC.jpg",
		x: 40,
		fy: 60,
		credit: "Martin Johnson Heade, Newburyport Meadows, c. 1876–81 (public domain)",
	},
	{
		id: "fitz-henry-lane-owls-head-penobscot-bay",
		file: "Fitz_Henry_Lane_-_Owl's_Head,_Penobscot_Bay,_Maine_-_Google_Art_Project.jpg",
		x: 55,
		fy: 60,
		credit: "Fitz Henry Lane, Owl's Head, Penobscot Bay, 1862 (public domain)",
	},
	{
		id: "fitz-henry-lane-braces-rock-eastern-point",
		file: "LaneFitzHughBracesRockEasternPointGloucester.jpg",
		x: 45,
		fy: 60,
		credit: "Fitz Henry Lane, Brace's Rock, Eastern Point, c. 1864 (public domain)",
	},
];

type Source = {
	/** The asset's name. */
	id: string;
	/** The file's name on Wikimedia Commons, without "File:". */
	file: string;
	credit: string;
};
export type Print = Source & { bottom: number; zoom: number; ink?: number };
export type Painting = Source & { x: number; fy?: number };
