// Where the real-database suite (npm run test:db) runs. Recreated on every run,
// so it must never point at a database anyone cares about.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://kigumi:kigumi@localhost:5433/kigumi_test'

export function assertTestDatabase(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!/_test$/.test(name)) {
    throw new Error(
      `Refusing to run the database suite against "${name}": its name must end in _test`
    )
  }
  return name
}
