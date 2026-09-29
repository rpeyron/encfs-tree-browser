/** True when the .encfs6.xml enables filename IV chaining (mount point becomes meaningful). */
export function hasChainedNameIv(xml: string): boolean {
  return /<chainedNameIV>\s*1\s*<\/chainedNameIV>/.test(xml);
}
