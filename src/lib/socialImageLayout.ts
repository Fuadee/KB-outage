export const SOCIAL_LAYOUT = {
  width: 1080, height: 1350, headerBottom: 164, mapTop: 168, infoTop: 1004,
  areaRowBottom: 1190,
  infoRows: {
    // Bounds include icon strokes; values start only after the complete icon row.
    area: { top: 1024, height: 30, gap: 14, valueTop: 1068,
      icon: { left: 40, top: 1025, right: 64, bottom: 1054 } },
    dateTime: { top: 1207, height: 44, gap: 15, valueTop: 1266,
      dateIcon: { left: 41, top: 1215, right: 71, bottom: 1248 },
      timeIcon: { left: 561, top: 1217, right: 595, bottom: 1251 } }
  },
  // Pixel bounds and Pango fit sizes for the single preview/export renderer.
  text: {
    headline: { left: 119, width: 550, maxHeight: 70, sizes: [49, 47, 45] },
    explanation: { left: 726, width: 349, size: 23 },
    areaLabel: { left: 79, top: 1024, width: 260, size: 25 },
    area: { left: 43, top: 1068, width: 984, maxHeight: 120, sizes: [55, 51, 47, 43, 39, 35, 32, 30] },
    dateLabel: { left: 84, top: 1211, width: 200, size: 24 },
    timeLabel: { left: 612, top: 1211, width: 200, size: 24 },
    date: { left: 43, top: 1266, width: 468, maxHeight: 60, sizes: [39, 37, 35, 33, 31] },
    time: { left: 568, top: 1266, width: 468, maxHeight: 60, sizes: [39, 37, 35, 33, 31] }
  },
  colors: { navy: "#123A63", darkNavy: "#0B2F52", orange: "#F57C18", background: "#F7F9FC", white: "#FFFFFF", text: "#17324D", muted: "#5F6B7A", mapBackground: "#263D51" }
} as const;
