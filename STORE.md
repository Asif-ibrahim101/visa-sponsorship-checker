# Chrome Web Store listing

Copy each section into the matching field in the Developer Dashboard.

## Name
Visa Sponsorship Checker (UK)

## Summary (132 characters max)
See which UK job listings are likely to come with Skilled Worker visa sponsorship, on LinkedIn, Indeed and career sites.

## Category
Productivity

## Language
English (UK)

## Description

Looking for a UK job that will sponsor your Skilled Worker visa? Most adverts never say. Visa Sponsorship Checker reads each listing for you and puts a badge on it, so the jobs worth applying for stand out and the dead ends fade away.

HOW IT DECIDES
• Is the employer a licensed sponsor? It checks the Home Office Register of Licensed Sponsors (Workers), downloaded from GOV.UK and refreshed weekly.
• What does the advert say? It reads the job description for wording like "we sponsor work visas" or "unable to offer sponsorship".
• Is the pay enough? It compares the advertised salary with the Skilled Worker salary floor (you can change the floor in settings).
• Is the role likely to qualify? Apprenticeships, part-time roles and short contracts are flagged.

THE BADGES
• Sponsors: licensed sponsor, and the advert offers sponsorship
• Possible: licensed sponsor, advert doesn't say either way
• Unlikely: licensed, but the salary is below the floor or the role rarely qualifies
• No: the advert rules sponsorship out
• Not licensed: the employer isn't on the sponsor register
• Unknown employer: posted by a recruitment agency (hidden by default)
• Entry level: graduate and junior roles, or adverts asking for at most one year's experience
• Outside UK: the role is based abroad

Hover over any badge to see exactly why, including the register entry it matched. Right-click to correct a wrong match; your corrections are remembered.

WHERE IT WORKS
• LinkedIn job search and job pages
• Indeed search results and job pages
• Company career pages on Workday, Greenhouse, Lever and Ashby
• Welcome to the Jungle job pages
• Any other site that publishes standard job posting data

PRIVATE BY DESIGN
• Everything runs in your browser. Nothing you browse is sent anywhere.
• It only reads pages you open yourself; it never visits job sites in the background.
• The only download is the public sponsor register from GOV.UK.
• No account, no tracking, no analytics.

PLEASE NOTE
A badge is a guide, not a guarantee. A sponsor licence means an employer can sponsor, not that it will for every role, and visa rules change. Always confirm with the employer before you apply. This extension is not affiliated with the Home Office, UK Visas and Immigration, LinkedIn, Indeed or any job site, and it is not legal advice.

## Single purpose
Shows how likely UK job listings are to come with Skilled Worker visa sponsorship, using the public GOV.UK sponsor register and the listing's own text.

## Permission justifications

**Host access to all websites (content script on <all_urls>)**
Employers post jobs on their own career sites under their own domains (for example careers.company.com embedding Workday or Greenhouse), so the extension cannot know the list of job sites in advance. On every page it only checks whether the page is a job listing; if not, it does nothing. It never reads or sends any other page content.

**gov.uk and assets.publishing.service.gov.uk**
To download the public Register of Licensed Sponsors (Workers) CSV. The file's address changes when it is republished, so the GOV.UK page is read first to find the current link.

**storage / unlimitedStorage**
To keep the sponsor register (about 120,000 entries) and the user's settings and corrections on their own device.

**alarms**
To refresh the sponsor register once a week.

## Remote code
No. All code is packaged in the extension.

## Data usage (Privacy practices tab)
- Does not collect or use any of the listed data types.
- Certify: not sold to third parties; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

## Privacy policy URL
https://asif-ibrahim101.github.io/visa-sponsorship-checker/privacy.html
(Live once the repository is on GitHub with Pages enabled on the /docs folder.)

## Images
- Icon: icons/icon-128.png (inside the zip)
- Screenshots (1280×800): assets/store/screenshot-1.png, assets/store/screenshot-2.png
- Small promo tile (440×280): assets/store/promo-small.png
