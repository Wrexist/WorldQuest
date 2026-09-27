import { router } from 'expo-router'
import { FriendsScreen } from '../src/features/friends/FriendsScreen.js'
export default function FriendsRoute(){return <FriendsScreen onBack={()=>router.canGoBack()?router.back():router.replace('/profile')}/>}
