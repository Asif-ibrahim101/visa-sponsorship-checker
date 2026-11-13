/** Any of these in a location means the job is (at least partly) in the UK. */
const UK =
  /\b(uk|u\.k\.|united kingdom|great britain|britain|england|scotland|wales|northern ireland|gb|gbr|london|manchester|edinburgh|glasgow|birmingham|leeds|bristol|cambridge|oxford|belfast|cardiff|newcastle|liverpool|sheffield|nottingham|reading|brighton|southampton|milton keynes|bath|aberdeen|dundee|leicester|coventry|guildford|slough|swindon|basingstoke|exeter|norwich|warrington|chester|stevenage|watford|croydon|harrogate|cheltenham|bournemouth|ipswich|plymouth|derby|sunderland|middlesbrough|stockport|wolverhampton)\b/i;
/** Words that say nothing about the country. */
const VAGUE = /\b(remote|hybrid|on-?site|in-?office|anywhere|worldwide|global|multiple locations|various|flexible|location|locations)\b/gi;

/**
 * The location when it is clearly outside the UK, otherwise undefined.
 * A job listing several places counts as UK if any of them is in the UK.
 */
export function outsideUk(location: string | undefined): string | undefined {
  if (!location) return undefined;
  const loc = location.replace(/\s+/g, ' ').trim();
  if (UK.test(loc)) return undefined;
  const rest = loc.replace(VAGUE, '').replace(/[^a-z]/gi, '');
  return rest ? loc : undefined;
}
