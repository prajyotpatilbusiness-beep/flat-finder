# Pune authorised portal feed inputs

Flat Finder does not scrape 99acres, NoBroker, Housing.com or Magicbricks pages.

To import property records, place an authorised CSV or JSON export in this folder:

- `99acres.csv` or `99acres.json`
- `nobroker.csv` or `nobroker.json`
- `housing.csv` or `housing.json`
- `magicbricks.csv` or `magicbricks.json`

Supported facts include listing ID, title, Pune locality, transaction type (rent/sale),
price in INR, BHK, area in sq.ft, coordinates, property type and original portal URL.
The importer drops personal contact/name fields and rejects URLs outside each portal's
domain. Use only exports whose licence/partner agreement allows this downstream use.

Do not put passwords, cookies, session tokens, seller mobile numbers, owner names or
private account data in these feeds. Do not commit an export to the repository unless
its publishing licence permits it. A private feed should be supplied through a secure
server-side process rather than stored in the public Git repository.

Once the authorised file is placed in this folder, run the workflow
**Build Pune search directory and authorised portal feeds** from GitHub Actions.
