# Unavailable Data
- If the users selects a month in the search box that we don't have data for, we need to show an error message as early as possible saying: Data Not Provided

# Bike Numbers Update
- On LOCALHOST bike numbers go up and down even when stopped, is this pulling real time data? Yes is the answer to that.
- On LIVE no new numbers are getting updated neighter in the GlobalStats component or when seleting a station.

- BUG: Between commits 6bd13fa and commit a21b738, we introduced a bug that happens on live but not on localhost. THE SEARCH MODAL INSERTING ANY DATE WILL SHOW IT AS HAVING NO DATA. ON LOCALHOST EVERYTHING WORKS AS EXPECTED

# Animation
- Let's indtroduce more colors for the dots so they change more oftnely
- When bikes get added or substracted from a station we should play the selected animation once

# Fix About Page
- The About Page is not rendering