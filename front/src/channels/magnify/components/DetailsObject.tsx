import { IFileObject } from '@jfvilas/react-file-manager'
import { Https } from '@mui/icons-material'
import { LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextareaAutosize, TextField, Tooltip, Typography } from '@mui/material'
import { convertBytesToSize, convertSizeToBytes } from '../Tools'
import React from 'react'

const _ = require('lodash')

interface IDetailsItem {
    name: string
    text: string
    source: string[]
    format: 'string'|'stringlist'|'table'|'objectprops'|'objectlist'|'objectobject'|'boolean'|'booleankeyname'|'keylist'|'edit'|'bar'|'age'
    invoke?: (ro:any, o:any, onLink:(kind:string, name:string, namespace:string) => void) => any
    style?: string[]
    items?: IDetailsItem[]
    processValue?: (value:any) => any
}

interface IDetailsSection {
    name: string
    text: string
    items: IDetailsItem[]
    root: string
}

interface IMagnifyObjectDetailsProps {
    sections: IDetailsSection[]
    object: IFileObject
    onChangeData: (src:string,data:any) => void
    onLink: (kind:string, name:string, namespace:string) => void
    onContainsEdit?: (val:boolean) => void
}

function formatAgeCompact(duracion:{ days: number, hours: number, minutes: number }) {
    let partes = []

    // Días
    const days = Math.floor(duracion.days);
    if (days > 0) {
        partes.push(`${days}d`);
        duracion.days -= duracion.days
    }

    // Horas
    const hours = Math.floor(duracion.hours);
    if (hours > 0 || partes.length > 0) { // Incluir horas si hay días o si es la unidad principal
        partes.push(`${hours}h`);
        duracion.hours -= duracion.hours
    }

    // Minutos
    const minutes = Math.floor(duracion.minutes);
    if (minutes > 0 && partes.length < 2) { // Incluir minutos solo si no se han incluido ya 2 unidades (para formato compacto)
        partes.push(`${minutes}m`);
    }

    // Devolver la cadena (unir las dos primeras partes para mantener la compacidad)
    return partes.slice(0, 2).join('')
}    

const DetailsObject: React.FC<IMagnifyObjectDetailsProps> = (props:IMagnifyObjectDetailsProps) => {
    let expanderId = 0
    let labelWidth = 15
    
    const containsEdit = React.useMemo(() => {
        if (!props.sections || !props.object.data) return false;
        // Buscamos si algún item en alguna sección tiene formato 'edit'
        return props.sections.some(section => 
            section.items.some(item => item.format === 'edit' || (item.style && item.style.includes('edit')))
        );
    }, [props.sections, props.object.data]);

    React.useEffect(() => {
        if (props.onContainsEdit) {
            props.onContainsEdit(containsEdit);
        }
    }, [containsEdit, props.onContainsEdit]);

    const getValue = (obj:any, src:string) => {
        let value:any
        if (src.includes('||')) {
            // format for selecting one from a list of proeperties:
            //  prop1||prop2||$default    (default value according to format, default for age is current moment)
            // or
            //  props1||prop2||37    (default fixed value)
            let parts = src.split('||')
            if (parts[parts.length-1]==='$default')
                value = '$default'
            else
                value = parts[parts.length-1]
            for (let part of parts) {
                if (Boolean (_.get(obj,part))) {
                    value = _.get(obj,part)
                    break
                }
            }
        }
        else {
            value = _.get(obj,src)
        }
        return value
    }

    const renderValue = (rootObj:any, srcobj:any, src:string, format:string, style:string[], level:number, content?:IDetailsItem[], invoke?:(ro:any, o:any, onLink:(kind:string, name:string, namespace:string) => void) => string[], itemx?:IDetailsItem) : JSX.Element => {
        let originalSrc = src
        if (src.startsWith('$')) return <Typography fontWeight={style.includes('bold')?'700':''} variant='body2'>{src.substring(1)}</Typography>
        let addLink = false
        if (src.startsWith('#')) {
            src=src.substring(1)
            addLink=true
        }

        let obj = JSON.parse(JSON.stringify(srcobj))
        if (src.includes('|') && src.includes(':')) {  
            // xxx|yyyy:clave 
            // merge los items de xxx y los de yyy que tengan el mismo valor de clave y deja el resultado en xxx
            let key = src.split(':')[1]
            let parts = src.split(':')[0].split('|')
            let keys=[]
            let result= []
            if (_.get(obj,parts[0])) keys = _.get(obj,parts[0]).map((o:any) => o[key])
            for (let kvalue of keys) {
                let a = _.get(obj,parts[0]).filter((x:any) => x[key]===kvalue)
                let b = _.get(obj,parts[1]).filter((x:any) => x[key]===kvalue)
                if (a.length===1 && b.length===1) {
                    let merge={ ...a[0], ...b[0]}
                    result.push(merge)
                }
            }
            _.set(obj, parts[0], result)
            //se cambia el src a xxx que es donde estan los datos mergeados
            src=parts[0]
        }

        let header = style && style.includes('header') && itemx? itemx.text+':\u00a0' : ''

        switch(format) {
            case 'age':
                let ts = Date.parse(getValue(obj,src))
                const now = new Date()
                let diffMs = now.getTime() - ts
                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                diffMs -= days * (1000 * 60 * 60 * 24)
                const hours = Math.floor(diffMs / (1000 * 60 * 60))
                diffMs -= hours * (1000 * 60 * 60)
                const minutes = Math.floor(diffMs / (1000 * 60))
                const duration = { days: days, hours: hours, minutes: minutes }
                return <Typography variant='body2'>{formatAgeCompact(duration)}</Typography>

            case 'boolean':
                let valBoolean = false
                if (src==='@string[]' && invoke)
                    valBoolean = Boolean(invoke(rootObj, obj, props.onLink)[0])
                else {
                    valBoolean = Boolean(_.get(obj,src))
                }

                let valueStyle = style.filter(s => s.startsWith(valBoolean+':'))
                if (style && valueStyle.length===1) {
                    let parts = valueStyle[0].split(':')
                    if (valBoolean)
                        return <Typography sx={{color:parts[2]}} variant='body2'>{parts[1]}</Typography>
                    else
                        return <Typography sx={{color:parts[2]}} variant='body2'>{parts[1]}</Typography>

                }
                else {
                    if (valBoolean)
                        return <Typography sx={{color:'green'}} variant='body2'>OK</Typography>
                    else
                        return <Typography sx={{color:'red'}} variant='body2'>ko</Typography>
                }

            case 'string':
                let valString = ''
                if ((src==='@string' || src==='@jsx') && itemx?.invoke) {
                    return <>{itemx.invoke(rootObj, obj, props.onLink) as JSX.Element}</>
                }

                if ((src==='@string[]') && invoke)
                    valString = invoke(rootObj, obj, props.onLink)[0]
                else {
                    valString = getValue(obj,src)
                }

                if (itemx?.processValue) {
                    try {
                        valString= itemx.processValue(valString)
                    }
                    catch {}
                }

                if (style && style.includes('mb')) {
                    valString=convertBytesToSize(convertSizeToBytes(valString))
                }
                
                if (style && style.includes('edit')) {
                    return <>{header}{renderValue(rootObj, srcobj, src, 'edit', style, level, [], undefined)}</>
                }
                else {
                    let v = valString
                    let fontWeightStyle = ''
                    let valueStyle:string[] = []
                    let jsxValue = <>{v}</>
                    if (v && style) {
                        let charLimit = style.find(s => s.startsWith('char:'))
                        if (charLimit) {
                            let limit = +charLimit.substring(5)
                            if (v && v.length>limit) jsxValue = <>{v.substring(0,limit)+'...'}</>
                        }

                        if (style.includes('bold')) fontWeightStyle = '700'

                        valueStyle = style.filter(s => s.startsWith(valString+':'))

                        let fixedColor = style.find(s => s.startsWith('color:'))
                        if (fixedColor) valueStyle=[fixedColor]

                        let linkStyle= style.find(s => s.startsWith('link:'))

                        if (linkStyle && addLink) {
                            //console.log('linkStyle', linkStyle)
                            let linkParts=linkStyle.split(':')
                            if (linkParts.length<4) {
                                console.log('link<4', linkStyle)
                            }
                            for (let i=1;i<=3;i++) {
                                if (linkParts[i].startsWith('$')) 
                                    linkParts[i] = linkParts[i].substring(1)
                                else
                                    linkParts[i] = _.get(obj,linkParts[i])
                            }
                            if (linkParts[3]==='$namespace') linkParts[3] = rootObj.metadata.namespace
                            jsxValue=<a href={`#`} onClick={() => props.onLink(linkParts[1], v, linkParts[3])}>{v}</a>
                        }
                    }
                    if (valueStyle.length>0) {
                        return <Typography component='div' color={valueStyle[0].split(':')[1]} fontWeight={fontWeightStyle} variant='body2'>{header}{jsxValue}</Typography>
                    }
                    else if (style) {
                        let propertyStyle = style.filter(s => s.startsWith('property:'))
                        if (propertyStyle.length>0) {
                            for (let ps of propertyStyle) {
                                let propertyParts = ps.split(':')
                                let propertyValue = _.get(obj,propertyParts[1])
                                if (propertyValue === propertyParts[2]) return <Typography component='div' color={propertyParts[3]} fontWeight={fontWeightStyle} variant='body2'>{header}{jsxValue}</Typography>
                            }
                        }
                    }
                    return <Typography component='div' fontWeight={fontWeightStyle} variant='body2'>{header}{jsxValue}</Typography>
                }

            case 'edit':
                //containsEdit=true
                let valEdit = _.get(obj,src)
                if (style.includes('base64')) valEdit = atob(valEdit)
                if (style.includes('multiline'))
                    return <TextareaAutosize name={src} defaultValue={valEdit} style={{width:'100%', marginTop:1, marginBottom:1, resize:'vertical', minHeight: '64px'}} onChange={(e) => props.onChangeData(src, e.target.value)}/>
                else
                    return <TextField name={src} defaultValue={valEdit} maxRows={5} sx={{width:'100%', mt:1, mb:1}} size='small' onChange={(e) => props.onChangeData(src, e.target.value)}/>

            case 'booleankey':
                if (_.get(obj,src)===true) return <>{src}</>
                return <></>

            case 'keylist':
                let keys = Object.keys(_.get(obj,src))
                return <>{renderValue(rootObj, {keys}, 'keys', 'stringlist', style, level, [], undefined)}</>

            case 'stringlist':
                let resultStringlist:string[]=[]
                if (src==='@string[]' && invoke) {
                    resultStringlist = invoke(rootObj, obj, props.onLink)
                }
                else
                    resultStringlist=_.get(obj,src)
                if (!resultStringlist) return <></>

                if (itemx?.processValue) {
                    try {
                        for (let i=0; i<resultStringlist.length;i++)
                            resultStringlist[i] = itemx.processValue(resultStringlist[i])
                    }
                    catch {}
                }

                if (style.includes('column')) {
                    let linkIndicator = originalSrc.startsWith('#')? '#' : ''
                    return <Stack direction={'column'}>
                        { resultStringlist.map((item:any, index:number) => <Typography component='div' key={index} variant='body2'>{renderValue(rootObj, resultStringlist, linkIndicator + '['+index+']', 'string', style, level+1, undefined, undefined)}</Typography>) }
                    </Stack>
                }
                else {
                    let val = resultStringlist.join(',\u00a0')
                    let st2 = style.filter(s => s.startsWith(val+':'))
                    if (st2.length>0)
                        return <Typography color={st2[0].split(':')[1]} variant='body2'>{header}{val}</Typography>
                    else
                        return <Typography variant='body2'>{header}{val}</Typography>
                }
                    

            case 'objectlist':
                let items:any[]=[]
                if (src==='@string[]' && invoke) {
                    items = invoke(rootObj, obj, props.onLink)
                }
                else if (src==='@object[]' && invoke) {
                    items = invoke(rootObj, obj, props.onLink)
                }
                else {
                    items = _.get(obj,src)
                }
                if (!items) return <></>

                if (style.includes('table') && content) {
                    return <TableContainer component={Paper} elevation={0} sx={{border: '1px solid #e0e0e0', mt:1, mb:1}}>
                        <Table size='small' sx={{width:'100%'}}>
                            <TableHead>
                                <TableRow>
                                    {content.map((c:IDetailsItem, cellIndex) => <TableCell key={cellIndex}>{c.text}</TableCell>)}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                { items.map((row:any, rowIndex) => {
                                    return <TableRow key={rowIndex}>
                                        {content.map((key:IDetailsItem, cellIndex) => {
                                            let subcontent = content.find((c:IDetailsItem) => c.name===key.name)
                                            if (!subcontent || !content) return <></>
                                            return <TableCell key={cellIndex}> {
                                                typeof _.get(row,key.source[0]) === 'object'?
                                                    (Array.isArray(_.get(row,key.source[0]))? 
                                                        <>{renderValue(rootObj, row, key.source[0], subcontent.format, key.style||[], level+1, subcontent.items, undefined)}</>
                                                        :
                                                        <>{renderValue(rootObj, row, key.source[0], content.find((kx:IDetailsItem) => kx.source[0]===key.source[0])!.format, content.find((kx:IDetailsItem) => kx.source[0]===key.source[0])!.style||[], level+1, [subcontent], undefined)}</>
                                                    )
                                                    :
                                                    <>{renderValues(rootObj, row, key, level+1)}</>
                                            }</TableCell>})
                                        }
                                    </TableRow>
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                }
                else {
                    return  <>{items.map((row:any, rowIndex:number) => {
                        if (!content) 
                            return <React.Fragment key={rowIndex}></React.Fragment>
                        else
                            return (
                                <Stack key={rowIndex} direction={style.includes('column')?'column':'row'} sx={{width:style.includes('fullwidth')?'100%':'auto'}}>
                                    { style.includes('column')?
                                        content.map((c:IDetailsItem, index:number) => {
                                            return <React.Fragment key={index}>{
                                                renderValues(rootObj, row, c, level+1)}
                                            </React.Fragment>
                                        })
                                        :
                                        content.map((c:IDetailsItem, index:number) => {
                                            return <React.Fragment key={index}>{renderValues(rootObj, row, c, level+1)} <>{rowIndex<items.length-1?',\u00a0':''}</> </React.Fragment>
                                        }) 
                                    }
                                </Stack>
                            )
                    })}</>
                }

            case 'objectobject':
                if (style.includes('table')) {
                    return <TableContainer component={Paper} elevation={0} sx={{border: '1px solid #e0e0e0', mt:1, mb:1}}>
                        <Table size='small'>
                            <TableHead>
                                <TableRow>
                                    {Object.keys(_.get(obj,src)[0]).map((k,cellIndex) => <TableCell key={cellIndex}>{k}</TableCell>)}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                            { _.get(obj,src).map((row:any, rowIndex:number) => {
                                return <TableRow key={rowIndex}>
                                    {Object.keys(_.get(obj,src)[0]).map((key,cellIndex) => <TableCell key={cellIndex}>{renderValue(rootObj, row, src, 'string', [], level+1, [], undefined)}</TableCell>)}
                                </TableRow>
                            })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                }
                else {
                    return  <>{_.get(obj,src).map((row:any, rowIndex:number) => {
                        if (!content) return <></>

                        return <React.Fragment key={rowIndex}>
                            {content.map((c:IDetailsItem, index) => <React.Fragment key={index}>{renderItem(rootObj, row, c, labelWidth, level+1)}</React.Fragment>)}
                        </React.Fragment>
                    })}</>
                }

            case 'objectprops':
                if (!_.get(obj,src)) return <></>

                if (style && style.includes('table')) {
                    if (itemx && itemx?.items) {
                        return <TableContainer component={Paper} elevation={0} sx={{border: '1px solid #e0e0e0', mt:1, mb:1}}>
                            <Table size='small'>
                                <TableHead>
                                    <TableRow>
                                        { itemx.items.map((i,cellIndex) => <TableCell key={cellIndex}>{i.text}</TableCell>) }
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        {
                                            itemx.items.map((item,cellIndex) => {
                                                return <TableCell key={cellIndex}>{renderValue(rootObj, obj, item.source[0], item.format, item.style||[], level)}</TableCell>
                                            })
                                        }
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    }
                    else {
                        return <TableContainer component={Paper} elevation={0} sx={{border: '1px solid #e0e0e0', mt:1, mb:1}}>
                            <Table size='small'>
                                <TableHead>
                                    <TableRow>
                                        { Object.keys(_.get(obj,src)).map( (k,cellIndex) => <TableCell key={cellIndex}>{k}</TableCell>) }
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        { Object.keys(_.get(obj,src)).map( (key,cellIndex) => <TableCell key={cellIndex}>{_.get(obj,src+'.[\''+key+'\']')}</TableCell>) }
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    }
                }
                else {
                    if (content) {
                        // selected object properties
                        return <>{content.map( (c:IDetailsItem, index:number) => {
                            return <Stack key={index} direction={c.style && c.style.includes('column')?'column':'row'}>
                                <Typography fontWeight={style && style.includes('keybold')?'700':''} variant='body2'>{c.text}:&nbsp;</Typography>
                                {renderValues(rootObj, obj,c, level+1)}
                            </Stack>
                        })}</>
                    }
                    else {
                        // all object properties
                        return <>{Object.keys(_.get(obj,src)).map((key:string,index:number) => {
                            if (style && style.includes('edit')) {
                                return <Stack key={index} direction={'column'} sx={{mt:1}}>
                                        <Stack direction={'row'}>
                                            <Tooltip title={key} placement='top'>
                                                <Typography fontWeight={style.includes('keybold')?'700':''} variant='body2'>{key}</Typography>
                                            </Tooltip>
                                            {style.includes('lockicon') && <Https fontSize={'small'} sx={{color:'red'}}/>}
                                        </Stack>
                                    {
                                        renderValue(rootObj, obj, src+'.[\''+key+'\']', 'edit', style, level+1, [], undefined)
                                    }                               
                                </Stack>
                            }
                            else {
                                return <Stack key={index} direction={'row'}>
                                    <Typography fontWeight={style.includes('keybold')?'700':''} variant='body2'>{key}:&nbsp;</Typography>
                                    {
                                        renderValue(rootObj, obj, src+'.[\''+key+'\']', 'string', style, level+1, [], undefined)
                                    }                               
                                </Stack>
                            }
                        })}</>
                    }
                }

            case 'table':
                if (!content) return <></>
                let result= _.get(obj,src) && <TableContainer component={Paper} elevation={0} sx={{border: '1px solid #e0e0e0', mt:1, mb:1}}>
                    <Table size='small'>
                        <TableHead>
                            <TableRow>
                                {content.map ((c:IDetailsItem, cellIndex:number) => <TableCell key={cellIndex}>{c.text}</TableCell>)}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            { _.get(obj,src).map((row:any, rowIndex:number) => {
                                return <TableRow key={rowIndex}>
                                    {content.map((c:IDetailsItem, cellIndex:number) => {
                                        return <TableCell key={cellIndex}>{renderValues(rootObj, row, c, level+1)}</TableCell>
                                    })}
                                </TableRow>
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
                return result

            default:
                return <></>
        }
    }

    const renderValues = (rootObj:any, obj:any, item:IDetailsItem, level:number) => {
        let firstSource = item.source[0].replace('#','')
        if (!firstSource.startsWith('@') && item.style?.includes('ifpresent') && _.get(obj,firstSource)===undefined) return <></>

        if (item.format==='bar') {
            let value = _.get(obj,item.source[0])
            let max = _.get(obj,item.source[1])
            if (!value || !max) return <></>

            let progreso=+value/+max*100
            return <Stack direction={'row'} width={'100%'} alignItems={'center'}>
                <LinearProgress variant="determinate" value={progreso > 100 ? 100 : progreso} sx={{width:'90%'}} />
                    &nbsp;
                <Typography variant='body2'>{value? value: 0}/{max? max:0}</Typography>
            </Stack>
        }
        else {
            return (
                <Stack direction={item.style?.includes('column')?'column':'row'} width={'100%'} alignItems={item.style?.includes('row')?'center':''}>
                    {item.source.map( (source,index) => {
                        return <React.Fragment key={index}>
                            {renderValue(rootObj, obj, source, item.format, item.style||[], level+1, item.items, item.invoke, item)}
                        </React.Fragment>
                    })}
                </Stack>
            )
        }
    }

    const renderItem = (rootObj:any, obj:any, item:IDetailsItem, width:number, level:number) => {
        let expander='class-kwirth-'+expanderId  // we use this classname as a trick for searchng th objext inside the DOM
        let firstSource = item.source[0].replace('#','')
        if (!firstSource.startsWith('@') && item.style?.includes('ifpresent') && _.get(obj,firstSource)===undefined) return <></>

        if (item.source && firstSource==='@jsx[]') {
            if (item.invoke) {
                return (
                    <Stack direction={item.style && item.style.includes('column')?'column':'row'} alignItems="stretch" sx={{ width: '100%' }}>
                        {(item.invoke(rootObj, obj, props.onLink) as JSX.Element[]).map((element,index) => 
                            <React.Fragment key={index}>
                                {element}
                            </React.Fragment>
                        )}
                    </Stack>
                )
            }
            else {
                return <>Inexistent Invoke</>
            }
        }
        else {
            let numProps = 0
            if (item.source && _.get(obj,item.source[0])) numProps = Object.keys(_.get(obj,item.source[0])).length
            expanderId++

            return (
                <Stack direction={'row'} alignItems={'baseline'}>
                    {item.text==='' && <>
                        {/* No label*/}
                        <Typography component='div' width={'100%'} variant='body2'>
                            {renderValues(rootObj, obj, item, level)}
                        </Typography>
                    </>}
                    {item.text!=='' && <>
                        {/* render label*/}
                        {
                            numProps>1 && item.style && item.style.includes('collapse')?
                                    // render a label with collapse button
                                    <Stack direction={'row'} width={`${width-2}%`} alignItems={'center'}>
                                        <Typography variant='body2'>{item.text}</Typography>
                                        <svg className={'svg-'+expander} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"
                                            onClick={ () => {
                                                let divElement = document.getElementsByClassName(expander)[0] as HTMLElement
                                                if (divElement) {
                                                    if (divElement.style.height==='auto') {
                                                        divElement.style.height='22px'
                                                        document.getElementsByClassName('svg-'+expander)[0].innerHTML = `<path d="M16.59 8.59L12 13.17L7.41 8.59L6 10L12 16L18 10L16.59 8.59Z" />`
                                                    }
                                                    else {
                                                        divElement.style.height='auto'
                                                        document.getElementsByClassName('svg-'+expander)[0].innerHTML = `<path d="M12 8L6 14L7.41 15.41L12 10.83L16.59 15.41L18 14L12 8Z" />`
                                                    }
                                                }
                                            }}>                                            
                                            <path d="M16.59 8.59L12 13.17L7.41 8.59L6 10L12 16L18 10L16.59 8.59Z" />
                                        </svg>                                        
                                    </Stack>
                                :
                                    // render a simple label
                                    <Typography width={`${width}%`} variant='body2'>{item.text}</Typography>
                        }
                        {
                            // render content
                            numProps>1 && item.style && item.style.includes('collapse')? 
                                    // render collapsible content
                                    <div className={expander} style={{height:'22px', overflow:'hidden'}}>
                                        {renderValues(rootObj, obj, item, level)}
                                    </div>
                                :
                                    //render standard content
                                    renderValues(rootObj, obj, item, level)
                        }
                    </>}
                </Stack>
            )
        }
    }

    const renderSection = (rootObj:any, section:IDetailsSection) => {
        if (!rootObj) return
        return <>
            <Typography sx={{mt:2, mb:1}} variant={'body1'}><b>{section.text}</b></Typography>
            {section.items.map( (item, index) => 
                <React.Fragment  key={index}>
                    {renderItem(rootObj, rootObj, item, labelWidth, 0)}
                </React.Fragment>
            )}
        </>
    }


    if (props.object.data) {
        if (props.sections) {
            let details = props.sections.map((section:IDetailsSection, sectionIndex) =>
                <React.Fragment key={sectionIndex}>
                    {renderSection(props.object.data[section.root], section)}
                </React.Fragment>
            )
            return <>{ details }</>
        }
        else {
            return <><pre>{JSON.stringify(props.object.data.origin,undefined, 2)}</pre></>
        }
    }
    else {
        console.log(props.object)
        return <>No data</>
    }
}

export type { IMagnifyObjectDetailsProps, IDetailsSection, IDetailsItem }
export { DetailsObject }
