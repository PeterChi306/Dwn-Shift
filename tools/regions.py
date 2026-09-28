"""Named regions of Los Santerra and the character of their street pattern.

The reference map gives structure — where the districts are, which way their
grids run, where the hills start. It is not detailed enough to trace street by
street, so this file describes each region's *character* and tools/roadgen.py
generates a real street network from it.

Everything is in reference-image pixels (1536 x 1024 at 10 m/px), so one pixel
is ten metres and a typical Los Angeles block of 100 x 180 m is 10 x 18 px.

Fields
------
poly        boundary, pixels
angle       bearing of the long street family, degrees; the cross family is at
            angle + 90. 0 runs due east.
block       (along, across) spacing in pixels of the two families
major       every Nth line of each family is promoted to an avenue. Real
            arterials sit roughly 700-900 m apart, so this is 6-7 blocks, not
            the 3-4 it used to be -- at 3 the map was 460 km of arterial and
            every other street was four lanes wide.
minor       road kind used for the ordinary lines
names       street names for the long family, then the cross family
"""

# Downtown's grid really is rotated about 32 degrees off the compass, which is
# why Broadway and Main run diagonally across the reference. Keeping that makes
# the freeway interchanges and the block shapes read as Los Angeles.
DOWNTOWN_ANGLE = 58.0

REGIONS = [
    dict(name='Downtown Los Santerra',
         poly=[(772, 560), (905, 528), (1035, 600), (1050, 700), (960, 792), (820, 762), (762, 668)],
         angle=DOWNTOWN_ANGLE, block=(10.5, 15.0), major=7, minor='street',
         names=['Spring Street', 'Hill Street', 'Olive Street', 'Grand Avenue', 'Hope Street',
                'Flower Street', 'Bixel Street', 'Beaudry Avenue', 'Boylston Street',
                'Second Street', 'Third Street', 'Fourth Street', 'Fifth Street', 'Sixth Street',
                'Eighth Street', 'Ninth Street', 'Olympic Place', 'Pico Place', 'Venice Place']),

    dict(name='Koreatown',
         poly=[(620, 520), (795, 520), (795, 722), (620, 722)],
         angle=0.0, block=(11.0, 16.0), major=7, minor='street',
         names=['Oxford Avenue', 'Serrano Avenue', 'Kenmore Avenue', 'Catalina Street',
                'Harvard Boulevard', 'Hobart Boulevard', 'Ardmore Avenue', 'Berendo Street',
                'Sixth Street', 'Eighth Street', 'Ninth Street', 'Council Street',
                'James Wood Boulevard', 'San Marino Street', 'Ingraham Street']),

    dict(name='Hollywood',
         poly=[(430, 392), (735, 392), (735, 520), (430, 520)],
         angle=0.0, block=(11.5, 17.0), major=7, minor='street',
         names=['Cahuenga Boulevard', 'Vine Street', 'Gower Street', 'Bronson Avenue',
                'Wilcox Avenue', 'Highland Avenue', 'Orange Drive', 'Sycamore Avenue',
                'Selma Avenue', 'Yucca Street', 'Carlos Avenue', 'De Longpre Avenue',
                'Lexington Avenue', 'Willoughby Avenue']),

    dict(name='West Hollywood',
         poly=[(215, 408), (565, 408), (565, 500), (215, 500)],
         angle=0.0, block=(12.0, 15.0), major=7, minor='street',
         names=['Larrabee Street', 'Palm Avenue', 'Hilldale Avenue', 'Westbourne Drive',
                'Huntley Drive', 'Robertson Boulevard', 'Sweetzer Avenue', 'Kings Road',
                'Harper Avenue', 'Norton Avenue', 'Rosewood Avenue', 'Waring Avenue']),

    dict(name='Beverly Hills',
         poly=[(228, 470), (425, 470), (425, 645), (228, 645)],
         angle=0.0, block=(13.0, 19.0), major=6, minor='residential',
         names=['Camden Drive', 'Bedford Drive', 'Roxbury Drive', 'Linden Drive',
                'Maple Drive', 'Palm Drive', 'Elm Drive', 'Crescent Drive',
                'Carmelita Avenue', 'Elevado Avenue', 'Lomitas Avenue', 'Sunset Way',
                'Charleville Boulevard', 'Gregory Way']),

    dict(name='Fairfax',
         poly=[(468, 438), (600, 438), (600, 568), (468, 568)],
         angle=0.0, block=(11.5, 17.0), major=7, minor='street',
         names=['Genesee Avenue', 'Spaulding Avenue', 'Curson Avenue', 'Ogden Drive',
                'Detroit Street', 'Formosa Avenue', 'Oakwood Avenue', 'Clinton Street',
                'Rosewood Place', 'Beverly Place']),

    dict(name='Hancock Park',
         poly=[(512, 500), (665, 500), (665, 660), (512, 660)],
         angle=0.0, block=(16.0, 24.0), major=6, minor='residential',
         names=['June Street', 'Muirfield Road', 'Hudson Avenue', 'Plymouth Boulevard',
                'Lucerne Boulevard', 'Windsor Boulevard', 'Irving Boulevard',
                'Third Place', 'Fourth Place', 'Sixth Place', 'Wilshire Place']),

    dict(name='Mid-City',
         poly=[(180, 640), (715, 640), (715, 800), (180, 800)],
         angle=0.0, block=(12.0, 19.0), major=7, minor='street',
         names=['Hauser Boulevard', 'Cochran Avenue', 'Burnside Avenue', 'Ridgeley Drive',
                'Masselin Avenue', 'Orange Grove Avenue', 'Edinburgh Avenue', 'Stanley Avenue',
                'Alvira Street', 'Saturn Street', 'Airdrome Street', 'Cadillac Avenue',
                'Whitworth Drive', 'Pickford Street', 'Sawyer Street']),

    dict(name='Culver City',
         poly=[(140, 755), (350, 748), (355, 880), (145, 885)],
         angle=-7.0, block=(12.0, 18.0), major=6, minor='street',
         names=['Duquesne Avenue', 'Overland Avenue', 'Sepulveda Place', 'Irving Place',
                'Lafayette Place', 'Watseka Avenue', 'Cardiff Avenue',
                'Braddock Drive', 'Farragut Drive', 'Kelmore Street']),

    dict(name='Exposition Park',
         poly=[(360, 790), (700, 790), (700, 900), (360, 900)],
         angle=0.0, block=(12.0, 18.0), major=7, minor='street',
         names=['Hoover Street', 'Menlo Avenue', 'Budlong Avenue', 'Denker Avenue',
                'Halldale Avenue', 'Manhattan Place', 'Gramercy Place',
                'Adams Place', 'Vernon Place', 'Martin Luther King Way', 'Santa Barbara Way']),

    dict(name='Pasadena',
         poly=[(855, 70), (1130, 70), (1130, 320), (855, 320)],
         angle=1.5, block=(12.0, 18.0), major=7, minor='street',
         names=['Marengo Avenue', 'Los Robles Avenue', 'El Molino Avenue', 'Madison Avenue',
                'Wilson Avenue', 'Mentor Avenue', 'Catalina Avenue', 'Allen Avenue',
                'Union Street', 'Green Street', 'Cordova Street', 'Del Mar Place',
                'Villa Street', 'Mountain Street', 'Orange Grove Place']),

    dict(name='San Marino',
         poly=[(1145, 210), (1330, 210), (1330, 395), (1145, 395)],
         angle=0.0, block=(19.0, 27.0), major=6, minor='residential',
         names=['Virginia Road', 'Hillborn Road', 'Chelsea Road', 'Winston Avenue',
                'Roanoke Road', 'Lorain Road', 'Rubio Drive',
                'Monterey Walk', 'Shenandoah Road', 'Kewen Drive']),

    dict(name='Alhambra',
         poly=[(1110, 400), (1330, 400), (1330, 610), (1110, 610)],
         angle=0.0, block=(12.0, 18.0), major=7, minor='street',
         names=['Almansor Street', 'Granada Avenue', 'Electric Avenue', 'Palm Avenue',
                'Chapel Avenue', 'Second Street', 'Curtis Avenue',
                'Commonwealth Avenue', 'Main Place', 'Bay State Street', 'Norwood Place']),

    dict(name='Monterey Park',
         poly=[(1110, 620), (1340, 620), (1340, 780), (1110, 780)],
         angle=0.0, block=(12.5, 19.0), major=7, minor='street',
         names=['Garfield Place', 'New Avenue', 'Chandler Avenue', 'Ynez Avenue',
                'McPherrin Avenue', 'Alhambra Place', 'Hellman Place',
                'Emerson Avenue', 'Newmark Avenue', 'Riggin Street']),

    dict(name='El Monte',
         poly=[(1345, 430), (1500, 430), (1500, 620), (1345, 620)],
         angle=0.0, block=(14.0, 22.0), major=6, minor='street',
         names=['Tyler Avenue', 'Peck Road', 'Santa Anita Avenue', 'Cypress Avenue',
                'Ramona Place', 'Garvey Place', 'Lower Azusa Road']),

    dict(name='East Los Santerra',
         poly=[(1010, 750), (1330, 750), (1330, 900), (1010, 900)],
         angle=0.0, block=(12.5, 19.0), major=7, minor='street',
         names=['Soto Street', 'Lorena Street', 'Indiana Street', 'Ford Boulevard',
                'McDonnell Avenue', 'Eastern Place', 'Woods Avenue',
                'Olympic Place', 'Cesar Chavez Way', 'Brooklyn Place']),

    dict(name='Eagle Rock', relief=78.0,
         poly=[(940, 385), (1095, 385), (1095, 470), (940, 470)],
         angle=0.0, block=(12.0, 18.0), major=6, minor='residential',
         names=['Hill Drive', 'Las Colinas Avenue', 'Argus Drive', 'Yosemite Drive',
                'Mount Royal Drive', 'Linda Rosa Avenue', 'Highland View Avenue']),

    dict(name='Central Los Santerra',
         poly=[(700, 730), (1000, 760), (1000, 900), (700, 900)],
         angle=0.0, block=(12.0, 18.0), major=7, minor='street',
         names=['Maple Place', 'Trinity Street', 'Naomi Avenue', 'Compton Place',
                'Central Place', 'Hooper Avenue',
                'Twenty-Third Street', 'Adams Place', 'Washington Place']),

    # --- districts that fill the rest of the basin, so the city has no holes ---

    dict(name='Silver Lake', relief=78.0,
         poly=[(742, 396), (872, 388), (898, 470), (860, 540), (762, 516)],
         angle=18.0, block=(12.0, 18.0), major=6, minor='residential',
         names=['Micheltorena Street', 'Hoover Terrace', 'Effie Street', 'Occidental Boulevard',
                'Lucile Avenue', 'Maltman Avenue', 'Griffith Park Place', 'Rowena Terrace',
                'Angus Street', 'Redcliff Street']),

    dict(name='Echo Park', relief=78.0,
         poly=[(852, 458), (982, 448), (1000, 542), (884, 566)],
         angle=-12.0, block=(12.0, 18.0), major=6, minor='residential',
         names=['Laveta Terrace', 'Lemoyne Street', 'Cerro Gordo Street', 'Douglas Street',
                'Calumet Avenue', 'Fargo Street', 'Baxter Street',
                'Marathon Place', 'Montana Place', 'Scott Place']),

    dict(name='Westlake',
         poly=[(736, 522), (804, 526), (826, 650), (740, 702)],
         angle=4.0, block=(11.0, 16.0), major=7, minor='street',
         names=['Alvarado Terrace', 'Bonnie Brae Street', 'Coronado Street', 'Union Place',
                'Burlington Avenue', 'Carondelet Street', 'Rampart Place',
                'Miramar Street', 'Beverly Place', 'Third Place']),

    dict(name='Lincoln Heights', relief=78.0,
         poly=[(878, 470), (1000, 466), (1012, 578), (892, 582)],
         angle=-6.0, block=(12.5, 19.0), major=7, minor='street',
         names=['Griffin Avenue', 'Workman Street', 'Sichel Street', 'Daly Street',
                'Pasadena Place', 'Broadway Terrace', 'Mission Place',
                'Avenue Twenty', 'Avenue Twenty-Six', 'Avenue Thirty']),

    dict(name='Highland Park', relief=78.0,
         poly=[(946, 326), (1092, 330), (1096, 392), (950, 388)],
         angle=-4.0, block=(12.0, 18.0), major=6, minor='residential',
         names=['Figueroa Terrace', 'Marmion Way', 'Monte Vista Street', 'Aldama Street',
                'Piedmont Avenue', 'Avenue Fifty', 'Avenue Fifty-Six']),

    dict(name='Boyle Heights',
         poly=[(1006, 598), (1106, 598), (1106, 752), (1006, 752)],
         angle=0.0, block=(12.0, 18.0), major=7, minor='street',
         names=['Chicago Street', 'Breed Street', 'Mott Street', 'Fickett Street',
                'Cummings Street', 'Evergreen Avenue', 'Mathews Street',
                'Fourth Place', 'Wabash Avenue', 'Michigan Place']),

    dict(name='South Los Santerra',
         poly=[(700, 702), (1008, 728), (1008, 792), (700, 766)],
         angle=0.0, block=(12.0, 18.0), major=7, minor='street',
         names=['Griffith Avenue', 'Stanford Avenue', 'Paloma Street', 'Wall Place',
                'San Pedro Place', 'Avalon Place',
                'Twentieth Street', 'Twenty-First Street', 'Jefferson Place']),

    dict(name='Westwood',
         poly=[(152, 468), (232, 468), (232, 664), (152, 664)],
         angle=0.0, block=(13.0, 19.0), major=6, minor='residential',
         names=['Glendon Avenue', 'Kelton Avenue', 'Midvale Avenue', 'Selby Avenue',
                'Malcolm Avenue', 'Ashton Avenue', 'Lindbrook Place']),

    dict(name='Palms',
         poly=[(148, 668), (240, 664), (244, 758), (150, 760)],
         angle=-5.0, block=(12.0, 18.0), major=6, minor='street',
         names=['Motor Avenue', 'Vinton Avenue', 'Clarington Avenue', 'Manning Avenue',
                'Regent Street', 'Woodbine Street', 'Rose Place']),

    dict(name='Montecito Heights', relief=78.0,
         poly=[(1014, 432), (1108, 430), (1108, 596), (1014, 594)],
         angle=0.0, block=(13.0, 19.0), major=6, minor='residential',
         names=['Sierra Vista Road', 'Cliff Drive', 'Homer Street', 'Lynnfield Street',
                'Monterey Terrace', 'Coast Place', 'Poppy Peak Drive']),

    dict(name='South El Monte',
         poly=[(1336, 628), (1500, 628), (1500, 806), (1336, 806)],
         angle=0.0, block=(14.0, 21.0), major=6, minor='street',
         names=['Rosemead Place', 'Durfee Avenue', 'Central Place', 'Merced Avenue',
                'Fern Street', 'Loma Avenue', 'Klingerman Street']),
]

# Ground above this much crest relief is hillside, not basin: the grid stops and
# the canyon roads in tools/roadgen.py take over.
GRID_RELIEF_LIMIT = 26.0
