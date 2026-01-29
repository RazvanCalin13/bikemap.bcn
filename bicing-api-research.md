Finding the official Bicing API can be a bit of a scavenger hunt because the city transitioned to a newer system (managed by **BSM** via the **smou** app) and updated their data standards.  
The current real-time data for Bicing is provided via the **GBFS (General Bikeshare Feed Specification)** standard. You don't need a special API key for the public feeds, though some specific datasets on the Open Data portal might require a token for high-frequency access.

### **1. Real-Time GBFS Endpoints**

These are the most direct endpoints for building an app or service. They return standard JSON:

* **Station Information** (Static data: Name, coordinates, capacity):  
  https://api.bsmsa.eu/ext/api/bsm/gbfs/v2/en/station\_information  
* **Station Status** (Live data: Available mechanical/electric bikes, available docks):  
  https://api.bsmsa.eu/ext/api/bsm/gbfs/v2/en/station\_status  
* **System Information**:  
  https://api.bsmsa.eu/ext/api/bsm/gbfs/v2/en/system\_information

### **2. Open Data BCN (Official Portal)**

For historical data, analytics, or if you want to use the city's **CKAN API**, you should head to the **Open Data BCN** portal.

* **Main Dataset Page:** [Bicing Stations Information](https://opendata-ajuntament.barcelona.cat/data/en/dataset/informacio-estacions-bicing)  
* **Usage Patterns:** [Bicing Service Usage](https://opendata-ajuntament.barcelona.cat/en/us-servei-bicing)  
* **Developer Guide:** If you want to query the portal programmatically using SQL-like queries, check their [Developer Section](https://opendata-ajuntament.barcelona.cat/en/desenvolupadors).

### **3. Implementation Details**

* **Format:** Standard JSON.  
* **Rate Limits:** The public Open Data API generally limits users to **30 requests per minute**. If you are just hitting the GBFS endpoints directly, they are quite stable, but it's good practice to cache the data locally for at least 30-60 seconds.  
* **Pro-tip:** Since you work in tech and likely want to parse this efficiently, the station\_status endpoint includes a last\_reported timestamp for each station so you can track how "fresh" the data is.