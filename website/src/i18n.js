import { createContext, useContext } from 'react';

export const STRINGS = {
  en: {
    nav: { features: 'Features', demos: 'Demos', robots: 'Robots', screens: 'Screenshots', download: 'Download', faq: 'FAQ' },
    menu: 'Menu',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    hero: {
      badge: 'Free · Windows and web · English and Slovak',
      title: 'Build a robot from parts, then make it reach.',
      text: 'BeanyIK is a desktop app for robot kinematics. Drag joints into a chain, describe them with DH parameters or your own 4×4 matrices, or import a URDF, and solve forward and inverse kinematics live in 3D.',
      download: 'Download for {os}',
      downloadAll: 'All downloads',
      openWeb: 'Open in browser',
      github: 'View on GitHub',
      version: 'Version {v}',
    },
    stats: [
      ['4', 'templates with closed form IK'],
      ['0.1 mm', 'demo path accuracy'],
      ['2', 'languages, EN and SK'],
      ['MIT', 'free and open source'],
    ],
    features: {
      kicker: 'What it does',
      title: 'Everything a kinematics course throws at you',
      items: [
        ['chain', 'blue', 'Drag and drop chain', 'Drop revolute, prismatic, fixed and matrix joints anywhere in the chain. Reorder with the grip, click to edit.'],
        ['table', 'indigo', 'Standard or modified DH', 'θ, d, a and α per joint with limits and a home pose. Switch between the distal and the Craig convention at any time.'],
        ['matrix', 'purple', 'Rx · Tz · Rz, like the lectures', 'Build each Aᵢ from elementary rotations and translations, or type the whole matrix. Every factor is drawn as its matrix.'],
        ['target', 'green', 'Numerical IK', 'Damped least squares on the Jacobian with joint limits. Drag the target and the arm follows smoothly.'],
        ['code', 'red', 'Your closed form', 'Write your own analytic solution in the app. Every branch is verified with forward kinematics.'],
        ['shield', 'teal', 'No flicking', 'While dragging, joints move a few degrees per frame at most and never jump to the other elbow solution.'],
        ['jacobian', 'orange', 'Jacobian and singularities', 'Manipulability, smallest singular value, det J and a warning when the arm gets close to a singular pose.'],
        ['export', 'magenta', 'URDF in, MATLAB out', 'Import a robot from a URDF file with its joint limits. Export symbolic FK and the Jacobian to MATLAB, the DH table to CSV or LaTeX.'],
      ],
    },
    demos: {
      kicker: 'Templates',
      title: 'Every template comes with a demo',
      text: 'Open a template and it starts moving. The planned path is dashed, the tool leaves a trail and the IK is solved every frame.',
      items: [
        ['arm6', '6-DOF arm', 'Anthropomorphic arm with a spherical wrist. Traces a circle with the tool pointing down.', '8 closed form branches'],
        ['leg3', 'Quadruped leg', 'Hip abduction, hip flexion and knee. Walks with a stance and a swing phase.', '4 closed form branches'],
        ['planar2', 'Planar 2R', 'The classic two-link arm. The tip draws a figure eight.', 'Elbow up and down'],
        ['scara', 'SCARA', 'R R P R pick and place. Down, lift, carry over, place and back.', 'Elbow left and right'],
      ],
    },
    web: {
      phone: 'The web version needs a computer with a mouse. You can still download the URDF files below.',
      samplesKicker: 'URDF',
      samplesTitle: 'Sample robots',
      samplesText: 'Real arms as URDF files. Download one and open it with Import URDF.',
      joints: '{n} joints',
      download: 'Download URDF',
      photo: 'Photo',
      noPhoto: 'No free photo yet',
      seeMaker: 'See it at {maker}',
    },
    screens: {
      kicker: 'Screenshots',
      title: 'The real app, not a mockup',
      tabs: { light: 'Light', dark: 'Dark', sk: 'Slovak' },
      close: 'Close',
    },
    steps: {
      kicker: 'How it works',
      title: 'From empty chain to solved pose',
      items: [
        ['Build', 'Pick a template, import a URDF or start empty, then drag parts from All tools into the chain.'],
        ['Describe', 'Fill in θ, d, a, α or type the matrix. Put lengths into parameters to change them in one place.'],
        ['Solve', 'Drag the target, press Ctrl+Enter, or run your own closed form and compare every branch.'],
        ['Export', 'Save a .robot.json, or export to MATLAB, CSV and LaTeX for your report.'],
      ],
    },
    shortcuts: {
      kicker: 'Keyboard',
      title: 'Fast once your hands know it',
      items: [
        ['Ctrl+M', 'Move the IK target'], ['Ctrl+R', 'Rotate the IK target'], ['Ctrl+Enter', 'Solve numerically'],
        ['Ctrl+P', 'Play the demo'], ['Ctrl+T', 'New robot tab'], ['Ctrl+W', 'Close tab'],
        ['Ctrl+1 … 9', 'Switch tabs'], ['Ctrl+Z', 'Undo'], ['F1', 'All shortcuts'],
      ],
    },
    download: {
      kicker: 'Download',
      title: 'Get BeanyIK',
      text: 'Free, no account. The app checks for updates and installs them for you.',
      win: 'Windows',
      winSetup: 'Installer',
      winSetupHint: 'Start menu, desktop shortcut, updates itself',
      winPortable: 'Portable',
      winPortableHint: 'One file, runs without installing',
      web: 'Web version',
      webOpen: 'Open in browser',
      webHint: 'Any computer, Mac included. Saving is off',
      smartscreen: 'Windows may say "Windows protected your PC" the first time. Click More info, then Run anyway.',
      source: 'Or run it from source with Node.js:',
    },
    faq: {
      kicker: 'FAQ',
      title: 'Questions',
      items: [
        ['Is it free?', 'Yes. BeanyIK is MIT licensed, with no account and no ads.'],
        ['Does it send my robots anywhere?', 'No. Robots, tabs and settings stay on your computer. The only network traffic is the update check and, if you accept, the download from GitHub.'],
        ['Can I use it to move a real robot?', 'It is an educational and design tool. Use it to check your math, never as the only basis for moving real hardware.'],
        ['My course uses the modified (Craig) convention.', 'Switch it at the top of the Kinematic chain panel. The DH table and the meaning of a and α follow.'],
        ['I only have matrices, not a DH table.', 'Use Matrix joint parts and type each Aᵢ with the variable q in it.'],
        ['Can I load my robot from ROS?', 'Yes, open a .urdf through Menu, Import URDF. The longest moving chain comes over as elementary transforms with its limits, a gripper at the tip is left out. Meshes are ignored and xacro files need converting to URDF first.'],
        ['Is there a Slovak version?', 'Yes, the whole app, the installer, the README and this website are in English and Slovak.'],
      ],
    },
    footer: {
      made: 'Made by GreenyBeany',
      terms: 'Terms and privacy',
      credits: 'Credits',
      license: 'MIT License',
      readme: 'Documentation',
      logo: 'Logo generated with Google Gemini under GreenyBeany\'s art direction.',
    },
  },
  sk: {
    nav: { features: 'Funkcie', demos: 'Ukážky', robots: 'Roboty', screens: 'Snímky', download: 'Stiahnuť', faq: 'Otázky' },
    menu: 'Menu',
    themeLight: 'Svetlá téma',
    themeDark: 'Tmavá téma',
    hero: {
      badge: 'Zadarmo · Windows a web · slovenčina a angličtina',
      title: 'Poskladaj robota z dielov a nauč ho dosiahnuť cieľ.',
      text: 'BeanyIK je desktopová aplikácia na kinematiku robotov. Pretiahni kĺby do reťazca, popíš ich DH parametrami alebo vlastnými maticami 4×4 alebo importuj URDF a rieš priamu aj inverznú kinematiku naživo v 3D.',
      download: 'Stiahnuť pre {os}',
      downloadAll: 'Všetky súbory',
      openWeb: 'Otvoriť v prehliadači',
      github: 'Pozrieť na GitHube',
      version: 'Verzia {v}',
    },
    stats: [
      ['4', 'šablóny s IK v uzavretom tvare'],
      ['0,1 mm', 'presnosť dráh v ukážkach'],
      ['2', 'jazyky, SK a EN'],
      ['MIT', 'zadarmo a open source'],
    ],
    features: {
      kicker: 'Čo vie',
      title: 'Všetko, čo na teba hodí predmet z kinematiky',
      items: [
        ['chain', 'blue', 'Reťazec ťahaním', 'Rotačné, posuvné, pevné aj maticové kĺby pustíš kamkoľvek do reťazca. Úchytom meníš poradie, kliknutím upravuješ.'],
        ['table', 'indigo', 'Štandardná aj modifikovaná DH', 'θ, d, a, α pre každý kĺb s limitmi a domovskou polohou. Distálnu a Craigovu konvenciu prepneš kedykoľvek.'],
        ['matrix', 'purple', 'Rx · Tz · Rz ako na prednáškach', 'Každú Aᵢ poskladáš z elementárnych rotácií a posunov, alebo zadáš celú maticu. Každý činiteľ je nakreslený ako matica.'],
        ['target', 'green', 'Numerická IK', 'Tlmené najmenšie štvorce na Jakobiáne s limitmi kĺbov. Ťaháš cieľ a rameno ho plynulo nasleduje.'],
        ['code', 'red', 'Tvoje riešenie', 'Analytické riešenie napíšeš priamo v aplikácii. Každá vetva sa overí priamou kinematikou.'],
        ['shield', 'teal', 'Žiadne preskakovanie', 'Počas ťahania sa kĺby za snímok pohnú najviac o pár stupňov a nikdy nepreskočia na druhú konfiguráciu lakťa.'],
        ['jacobian', 'orange', 'Jakobián a singularity', 'Manipulovateľnosť, najmenšia singulárna hodnota, det J a varovanie, keď sa rameno blíži k singularite.'],
        ['export', 'magenta', 'Dnu URDF, von MATLAB', 'Import robota zo súboru URDF aj s limitmi kĺbov. Export symbolickej FK a Jakobiánu do MATLABu, DH tabuľky do CSV alebo LaTeXu.'],
      ],
    },
    demos: {
      kicker: 'Šablóny',
      title: 'Každá šablóna má svoju ukážku',
      text: 'Otvor šablónu a začne sa hýbať. Plánovaná dráha je čiarkovaná, nástroj zanecháva stopu a IK sa rieši v každom snímku.',
      items: [
        ['arm6', '6-osové rameno', 'Antropomorfné rameno so sférickým zápästím. Kreslí kruh s nástrojom nadol.', '8 vetiev riešenia'],
        ['leg3', 'Noha štvornohého robota', 'Abdukcia bedra, flexia bedra a koleno. Kráča s fázou opory a švihu.', '4 vetvy riešenia'],
        ['planar2', 'Rovinný 2R', 'Klasické dvojčlánkové rameno. Hrot kreslí osmičku.', 'Lakeť hore a dole'],
        ['scara', 'SCARA', 'R R P R prenesenie predmetu. Dole, zdvih, presun, položenie a späť.', 'Lakeť vľavo a vpravo'],
      ],
    },
    web: {
      phone: 'Webová verzia potrebuje počítač s myšou. URDF súbory nižšie si však stiahnuť môžeš.',
      samplesKicker: 'URDF',
      samplesTitle: 'Vzorové roboty',
      samplesText: 'Skutočné ramená ako URDF súbory. Stiahni si ktorýkoľvek a otvor ho cez Importovať URDF.',
      joints: '{n} kĺbov',
      download: 'Stiahnuť URDF',
      photo: 'Foto',
      noPhoto: 'Voľná fotka zatiaľ nie je',
      seeMaker: 'Pozri u {maker}',
    },
    screens: {
      kicker: 'Snímky obrazovky',
      title: 'Skutočná aplikácia, žiadna maketa',
      tabs: { light: 'Svetlá', dark: 'Tmavá', sk: 'Slovenčina' },
      close: 'Zavrieť',
    },
    steps: {
      kicker: 'Ako to funguje',
      title: 'Od prázdneho reťazca k vyriešenej polohe',
      items: [
        ['Postav', 'Vyber šablónu, importuj URDF alebo začni od nuly a ťahaj diely zo Všetkých nástrojov do reťazca.'],
        ['Popíš', 'Vyplň θ, d, a, α alebo zadaj maticu. Dĺžky daj do parametrov a meníš ich na jednom mieste.'],
        ['Rieš', 'Ťahaj cieľ, stlač Ctrl+Enter alebo spusti vlastné riešenie a porovnaj všetky vetvy.'],
        ['Exportuj', 'Ulož .robot.json alebo exportuj do MATLABu, CSV a LaTeXu do svojej správy.'],
      ],
    },
    shortcuts: {
      kicker: 'Klávesnica',
      title: 'Rýchle, keď ich máš v rukách',
      items: [
        ['Ctrl+M', 'Posun IK cieľa'], ['Ctrl+R', 'Rotácia IK cieľa'], ['Ctrl+Enter', 'Vyriešiť numericky'],
        ['Ctrl+P', 'Prehrať ukážku'], ['Ctrl+T', 'Nová karta s robotom'], ['Ctrl+W', 'Zavrieť kartu'],
        ['Ctrl+1 … 9', 'Prepínanie kariet'], ['Ctrl+Z', 'Späť'], ['F1', 'Všetky skratky'],
      ],
    },
    download: {
      kicker: 'Stiahnuť',
      title: 'Získaj BeanyIK',
      text: 'Zadarmo, bez účtu. Aplikácia sama kontroluje aktualizácie a nainštaluje ich za teba.',
      win: 'Windows',
      winSetup: 'Inštalátor',
      winSetupHint: 'Ponuka Štart, odkaz na ploche, sám sa aktualizuje',
      winPortable: 'Prenosná verzia',
      winPortableHint: 'Jeden súbor, bez inštalácie',
      web: 'Webová verzia',
      webOpen: 'Otvoriť v prehliadači',
      webHint: 'Na akomkoľvek počítači, aj na Macu. Bez ukladania',
      smartscreen: 'Windows môže pri prvom spustení napísať „Systém Windows ochránil váš počítač“. Klikni na Ďalšie informácie a potom Spustiť aj tak.',
      source: 'Alebo ju spusti zo zdrojového kódu cez Node.js:',
    },
    faq: {
      kicker: 'Otázky',
      title: 'Časté otázky',
      items: [
        ['Je to zadarmo?', 'Áno. BeanyIK je pod licenciou MIT, bez účtu a bez reklám.'],
        ['Posiela niekam moje roboty?', 'Nie. Roboty, karty aj nastavenia zostávajú v tvojom počítači. Jediná komunikácia je kontrola aktualizácií a, ak ju potvrdíš, stiahnutie z GitHubu.'],
        ['Môžem tým hýbať skutočným robotom?', 'Je to vzdelávací a návrhový nástroj. Použi ho na kontrolu výpočtov, nikdy ako jediný podklad na pohyb skutočného hardvéru.'],
        ['V škole používame modifikovanú (Craig) konvenciu.', 'Prepni ju hore v paneli Kinematický reťazec. DH tabuľka aj význam a a α sa prispôsobia.'],
        ['Mám iba matice, nie DH tabuľku.', 'Použi diely Maticový kĺb a zadaj každú Aᵢ s premennou q.'],
        ['Viem načítať robota z ROS?', 'Áno, otvor .urdf cez Menu, Importovať URDF. Najdlhší pohyblivý reťazec sa prenesie ako elementárne transformácie aj s limitmi, chápadlo na konci sa vynechá. Meshe sa ignorujú a xacro treba najprv previesť na URDF.'],
        ['Je aj slovenská verzia?', 'Áno, celá aplikácia, inštalátor, README aj táto stránka sú po slovensky aj po anglicky.'],
      ],
    },
    footer: {
      made: 'Vytvoril GreenyBeany',
      terms: 'Podmienky a súkromie',
      credits: 'Poďakovanie',
      license: 'Licencia MIT',
      readme: 'Dokumentácia',
      logo: 'Logo vygenerované pomocou Google Gemini podľa návrhu GreenyBeany.',
    },
  },
};

export const LangContext = createContext({ lang: 'en', t: STRINGS.en, setLang: () => {} });
export const useLang = () => useContext(LangContext);

export function fill(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function initialLang() {
  try {
    const saved = localStorage.getItem('beanyik_site_lang');
    if (saved === 'en' || saved === 'sk') return saved;
  } catch { /* private mode */ }
  return (navigator.language || '').toLowerCase().startsWith('sk') ? 'sk' : 'en';
}
