/* Static data: the 12 toy-town clubs and the name pool for generated players. */
(function () {
  'use strict';
  const TB = globalThis.TB;

  // color = cap/helmet colour of the team's pegs, alt = used when two clubs clash
  TB.TEAMS = [
    { city: 'Tinville', name: 'Soldiers', abbr: 'TIN', div: 0, color: '#c8232c', alt: '#f2c230' },
    { city: 'Marble Bay', name: 'Shooters', abbr: 'MBS', div: 0, color: '#1f5fbf', alt: '#e8e8e8' },
    { city: 'Spring Harbor', name: 'Coils', abbr: 'SPH', div: 0, color: '#7a3fb8', alt: '#f39c34' },
    { city: 'Whirlton', name: 'Tops', abbr: 'WHT', div: 0, color: '#f08a1c', alt: '#1d2a6b' },
    { city: 'Clockwork City', name: 'Windups', abbr: 'CLK', div: 0, color: '#8a5a2b', alt: '#f3e3b5' },
    { city: 'Kite Hill', name: 'Flyers', abbr: 'KIT', div: 0, color: '#18a3b5', alt: '#ffd23f' },
    { city: 'Pinball Valley', name: 'Flippers', abbr: 'PBV', div: 1, color: '#e0367d', alt: '#2b2b2b' },
    { city: 'Jackstone', name: 'Jacks', abbr: 'JAX', div: 1, color: '#1d2a6b', alt: '#e8e8e8' },
    { city: 'Rocking Ridge', name: 'Ponies', abbr: 'RRP', div: 1, color: '#2e8b3e', alt: '#f2c230' },
    { city: 'Dominion', name: 'Dominoes', abbr: 'DOM', div: 1, color: '#2b2b2b', alt: '#f4f4f4' },
    { city: 'Puzzle Point', name: 'Pieces', abbr: 'PZP', div: 1, color: '#d6b01e', alt: '#7a1f2b' },
    { city: 'Balsa Beach', name: 'Gliders', abbr: 'BBG', div: 1, color: '#9a1f2f', alt: '#9fd3ff' },
  ];
  TB.DIVS = ['Playroom Division', 'Toybox Division'];

  TB.FIRST = [
    'Abe', 'Al', 'Andy', 'Archie', 'Arlo', 'Benny', 'Bert', 'Billy', 'Bo', 'Boone', 'Brady', 'Buck', 'Bud', 'Cal',
    'Carlos', 'Casey', 'Chet', 'Chuck', 'Clem', 'Cody', 'Danny', 'Dario', 'Dex', 'Doc', 'Duke', 'Dusty', 'Eddie',
    'Eli', 'Emilio', 'Ernie', 'Felix', 'Frankie', 'Gabe', 'Gus', 'Hank', 'Hector', 'Hiro', 'Ike', 'Jace', 'Jake',
    'Javi', 'Jimmy', 'Joey', 'Jonah', 'Julio', 'Kenji', 'Kip', 'Lefty', 'Lou', 'Luis', 'Manny', 'Marco', 'Max',
    'Mickey', 'Milo', 'Moe', 'Nate', 'Ned', 'Nico', 'Ollie', 'Oscar', 'Ozzie', 'Pablo', 'Pete', 'Rafa', 'Ray',
    'Reggie', 'Rico', 'Ritchie', 'Rocco', 'Rudy', 'Sal', 'Sammy', 'Shin', 'Skip', 'Sonny', 'Stan', 'Taro', 'Ted',
    'Tito', 'Tommy', 'Ty', 'Vic', 'Vinny', 'Wally', 'Walt', 'Woody', 'Yuki', 'Zeke',
  ];
  TB.LAST = [
    'Abbott', 'Alvarez', 'Bailey', 'Barker', 'Bennett', 'Bishop', 'Bolton', 'Brooks', 'Buckner', 'Calloway',
    'Castillo', 'Chandler', 'Cobbler', 'Crane', 'Dawson', 'Delgado', 'Dixon', 'Doyle', 'Duffy', 'Ellis', 'Espinoza',
    'Farley', 'Fenwick', 'Finch', 'Fletcher', 'Flores', 'Garza', 'Gibbs', 'Hale', 'Harper', 'Hatcher', 'Hayes',
    'Higgins', 'Hollis', 'Ito', 'Jansen', 'Kearney', 'Kimura', 'Kowalski', 'Lambert', 'Lark', 'Lopez', 'Maddox',
    'Malone', 'Marsh', 'Mendez', 'Moreno', 'Mullins', 'Nakamura', 'Navarro', 'Nolan', 'Okafor', 'Ortega',
    'Pappas', 'Parrish', 'Pike', 'Quinn', 'Ramos', 'Reyes', 'Riggs', 'Rollins', 'Salazar', 'Sato', 'Shelby',
    'Sparks', 'Stroud', 'Suarez', 'Tanaka', 'Thorne', 'Tibbs', 'Torres', 'Underwood', 'Vance', 'Vega', 'Wade',
    'Waller', 'Webb', 'Whitlock', 'Wilder', 'Yates', 'Young', 'Zamora', 'Zimmer',
  ];

  TB.INJURIES = [
    'hamstring strain', 'sprained ankle', 'sore shoulder', 'jammed finger', 'back spasms', 'elbow soreness',
    'bruised knee', 'oblique strain', 'stiff neck', 'wrist sprain', 'groin tightness', 'blister',
  ];
})();
