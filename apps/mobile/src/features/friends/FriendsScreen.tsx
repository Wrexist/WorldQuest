import { createThemeStyles } from '@worldquest/design'
import { EdgeScrollView } from '../../components/ScrollEdges.js'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { AnswerOption, Button, Card, ProgressBar, radius, Skeleton, space, text } from '@worldquest/design'
import type { ChallengeQuestion, FriendChallenge } from '@worldquest/engines'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { WorldMascot } from '../../components/WorldMascot.js'
import { useOnline } from '../../lib/connectivity.js'
import { formatDate, currentLocale, tContent, useT } from '../../lib/i18n.js'
import { useChallenges } from './useChallenges.js'

export function FriendsScreen({onBack}:{onBack:()=>void}) {
  const { colors, styles } = useThemeValues()
  const t=useT(),online=useOnline(),model=useChallenges()
  const [code,setCode]=useState(''),[report,setReport]=useState<string|null>(null)
  const disabled=model.busy||!online
  const act=model.act
  const scroller=useRef<ScrollView>(null)
  const roundId=model.round?.active.id
  useEffect(()=>{
    // A long question must not leave the next prompt above the current viewport.
    if(roundId)scroller.current?.scrollTo({y:0,animated:false})
  },[roundId,model.answers.length])
  return <View style={styles.screen}>
    <ScreenHeader title={t('friends:title')} onBack={model.round?model.leaveRound:onBack}/>
    <EdgeScrollView ref={scroller} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!online&&<Text style={styles.body} role="status">{t('friends:offline')}</Text>}
      {(model.error||model.loadError)&&<Card><Text style={styles.body} role="alert">{t('friends:error')}</Text><Button variant="tertiary" label={t('common:retry')} onPress={model.refresh} disabled={disabled}/></Card>}
      {model.notice&&<Text style={styles.body} role="status">{t(model.notice==='reported'?'friends:reported':'friends:blocked')}</Text>}
      {!model.enabled?<Card><Text style={styles.title}>{t('friends:unavailable')}</Text><Text style={styles.body}>{t('friends:accountNeeded')}</Text></Card>
        :model.round?<>
          <Text style={styles.title}>{t('friends:progress',{count:Math.min(model.answers.length+1,10)})}</Text>
          <ProgressBar current={model.answers.length} total={10} accessibilityLabel={t('friends:progress',{count:Math.min(model.answers.length+1,10)})}/>
          {model.answers.length<10?<Question key={model.answers.length} question={model.round.questions[model.answers.length]!} locale={model.round.active.locale} disabled={disabled} onAnswer={model.answer}/>
            :<Card style={styles.panel}><WorldMascot mood="encouraging" style={styles.mascot}/><Text style={styles.title}>{t('friends:readyToSend')}</Text><Text style={styles.body}>{t('friends:resultPrivacy')}</Text><Button variant="adventure" label={t(model.busy?'friends:sending':'friends:submit')} onPress={model.submit} disabled={disabled}/></Card>}
        </>:<>
          <Card style={styles.hero}><View style={styles.heroTop}><View style={styles.heroCopy}><Text style={styles.title}>{t('friends:hero')}</Text><Text style={styles.body}>{t('friends:intro')}</Text></View><WorldMascot mood="welcome" style={styles.mascot}/></View>
            <Text style={styles.body}>{t('friends:rules')}</Text>
            <Button variant="adventure" label={t('friends:create')} onPress={()=>void model.create()} disabled={disabled}/>
          </Card>
          {model.invite!==''&&<Card style={styles.panel}><Text style={styles.title}>{t('friends:inviteReady')}</Text><Text selectable style={styles.code}>{model.invite}</Text><Button variant="secondary" label={t('friends:share')} onPress={()=>{void Share.share({message:t('friends:shareMessage',{code:model.invite})}).catch(()=>{})}}/></Card>}
          <Card style={styles.panel}><Text style={styles.title}>{t('friends:haveCode')}</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} maxLength={48} accessibilityLabel={t('friends:codeLabel')} placeholder={t('friends:codeLabel')} placeholderTextColor={colors.text.tertiary} style={styles.input}/><Button variant="tertiary" label={t('friends:join')} disabled={disabled||!/^[a-f0-9]{24}$/.test(code.trim().toLowerCase())} onPress={()=>void act({action:'join',inviteCode:code.trim().toLowerCase()})}/></Card>
          <Text style={styles.title} role="heading">{t('friends:yourChallenges')}</Text>
          {model.loading?<Skeleton height={space[9]+space[9]}/>:model.challenges.length===0?<Text style={styles.body}>{t('friends:empty')}</Text>:model.challenges.map(c=><ChallengeCard key={c.id} challenge={c} disabled={disabled} reportOpen={report===c.id} onReport={()=>setReport(report===c.id?null:c.id)} act={act}/>)}
          <Button variant="ghost" label={t('friends:refresh')} onPress={model.refresh} disabled={disabled}/>
        </>}
    </EdgeScrollView>
  </View>
}
function Question({question,locale,onAnswer,disabled}:{question:ChallengeQuestion;locale:FriendChallenge['locale'];onAnswer:(id:string)=>void;disabled:boolean}) {
  const { styles } = useThemeValues()
  const t=useT(),[selected,setSelected]=useState<string|null>(null)
  const prompt=useRef<Text>(null)
  useEffect(()=>{
    if(Platform.OS!=='web'&&prompt.current)AccessibilityInfo.sendAccessibilityEvent(prompt.current,'focus')
  },[])
  return <View style={styles.panel}><Text ref={prompt} style={styles.title} role="heading">{tContent(question.promptKey,question.promptParams,locale)}</Text>
    {question.options.map((o,index)=><AnswerOption key={o.id} state={disabled?'disabled':selected===o.id?'selected':'idle'} badge={String.fromCharCode(65+index)} label={o.label} accessibilityLabel={o.label} onPress={()=>setSelected(o.id)}/>)}
    <Button variant="adventure" label={t('friends:lockAnswer')} disabled={disabled||selected===null} onPress={()=>{if(selected)onAnswer(selected)}}/>
  </View>
}
function ChallengeCard({challenge:c,disabled,reportOpen,onReport,act}:{challenge:FriendChallenge;disabled:boolean;reportOpen:boolean;onReport:()=>void;act:ReturnType<typeof useChallenges>['act']}) {
  const { styles } = useThemeValues()
  const t=useT()
  return <Card style={styles.panel}>
    <Text style={styles.title}>{c.peer??t('friends:privateInvite')}</Text>
    <Text style={styles.body}>{t('friends:expires',{date:formatDate(new Date(c.expiresAt),currentLocale())})}</Text>
    {c.result?<><Text style={styles.title}>{t(c.result.outcome==='won'?'friends:won':c.result.outcome==='lost'?'friends:lost':c.result.outcome==='draw'?'friends:draw':'friends:unplayed')}</Text>
      {c.result.yours!==null&&c.result.theirs!==null&&<Text style={styles.score}>{t('friends:score',{yours:c.result.yours,theirs:c.result.theirs})}</Text>}</>
      :<Text style={styles.body}>{t(c.submitted?'friends:waiting':'friends:ready')}</Text>}
    {c.state==='ready'&&!c.submitted&&<Button variant="adventure" label={t('friends:play')} onPress={()=>void act({action:'start',id:c.id})} disabled={disabled}/>}
    <Button variant="ghost" label={t('friends:hide')} onPress={()=>void act({action:'hide',id:c.id})} disabled={disabled}/>
    {c.canCancel&&<Button variant="ghost" label={t('friends:cancel')} onPress={()=>void act({action:'cancel',id:c.id})} disabled={disabled}/>}
    {c.peer&&<View style={styles.panel}><Button variant="tertiary" label={t('friends:block')} onPress={()=>void act({action:'block',id:c.id})} disabled={disabled}/><Button variant="ghost" label={t('friends:report')} onPress={onReport} disabled={disabled}/>
      {reportOpen&&(['unwanted','cheating','other'] as const).map(reason=><Button key={reason} variant="tertiary" label={t(reason==='unwanted'?'friends:reason.unwanted':reason==='cheating'?'friends:reason.cheating':'friends:reason.other')} onPress={()=>void act({action:'report',id:c.id,reason})} disabled={disabled}/>)}</View>}
  </Card>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles=StyleSheet.create({
  screen:{flex:1},content:{padding:space[4],gap:space[4],paddingBottom:space[9]},panel:{padding:space[4],gap:space[3]},
  hero:{padding:space[4],gap:space[4],backgroundColor:colors.leagueAdventure.start,borderColor:colors.leagueAdventure.end},
  heroTop:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:space[2]},heroCopy:{flex:1,minWidth:space[9]+space[9]},
  mascot:{width:space[9]+space[6],height:space[9]+space[6]},title:{...text('h2'),color:colors.text.primary},body:{...text('body'),color:colors.text.secondary},
  score:{...text('h3'),color:colors.action.secondary,backgroundColor:colors.journey.sky,padding:space[3],borderRadius:radius.lg},
  code:{...text('bodyStrong'),color:colors.text.primary,backgroundColor:colors.journey.sky,padding:space[3],borderRadius:radius.md},input:{...text('body'),color:colors.text.primary,backgroundColor:colors.bg.surface,minHeight:space[8],padding:space[3],borderWidth:1,borderColor:colors.border.strong,borderRadius:radius.md},
})
  return { colors, styles }
})
