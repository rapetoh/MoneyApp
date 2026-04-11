import { Redirect } from 'expo-router'

// "transaction/new" redirects to the Record tab
export default function NewTransaction() {
  return <Redirect href="/(tabs)/record" />
}
