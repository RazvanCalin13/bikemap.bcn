const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../../data');
const outputFile = path.resolve(__dirname, '../lib/data-manifest.json');

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

try {
    if (!fs.existsSync(dataDir)) {
        console.warn("Data directory not found:", dataDir);
        fs.writeFileSync(outputFile, JSON.stringify({ months: [] }, null, 2));
        process.exit(0);
    }

    const files = fs.readdirSync(dataDir);
    const months = files
        .filter(file => file.endsWith('.csv') && file.includes('BicingNou_ESTACIONS'))
        .map(file => {
            // Expected format: YYYY_MM_MonthName_...
            const match = file.match(/^(\d{4})_(\d{2})_/);
            if (match) {
                const year = parseInt(match[1], 10);
                const monthIndex = parseInt(match[2], 10) - 1;
                if (monthIndex >= 0 && monthIndex < 12) {
                    return {
                        year,
                        monthIndex,
                        label: monthNames[monthIndex]
                    };
                }
            }
            return null;
        })
        .filter(Boolean)
        // Remove duplicates if any
        .filter((item, index, self) =>
            index === self.findIndex((t) => (
                t.year === item.year && t.monthIndex === item.monthIndex
            ))
        )
        .sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.monthIndex - b.monthIndex;
        });

    const labels = months.map(m => m.label);

    // Create lib dir if it doesn't exist
    const libDir = path.dirname(outputFile);
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify({ months: labels }, null, 2));
    console.log(`Generated manifest with ${labels.length} months:`, labels);

} catch (error) {
    console.error("Error generating manifest:", error);
    process.exit(1);
}
