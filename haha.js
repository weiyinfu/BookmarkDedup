function push(a, x) {
    //向数组a中添加x元素，然后返回新数组
    let b = a.slice()
    b.push(x)
    return b
}

function dryRun() {
    //用于开发时进行调试
    if (window.DRY_RUN) {
        return true
    }
    return false;
}

function write(s) {
    //输出字符串
    document.querySelector("#output").innerHTML += s
}

function move(nodeId, parent) {
    return new Promise(resolve => {
        if (dryRun()) {
            resolve()
        } else {
            chrome.bookmarks.move(nodeId, parent, (res) => {
                resolve()
            })
        }
    })
}

function remove(nodeId) {
    return new Promise(resolve => {
        if (dryRun()) {
            console.log(`removing ${nodeId}`)
            resolve()
        } else {
            chrome.bookmarks.remove(nodeId, () => {
                resolve()
            })
        }
    })
}

function removeTree(nodeId) {
    return new Promise(resolve => {
        if (dryRun()) {
            resolve()
        } else {
            chrome.bookmarks.removeTree(nodeId, () => {
                resolve()
            })
        }
    })
}

function getTree() {
    return new Promise(resolve => {
        chrome.bookmarks.getTree(data => {
            resolve(data)
        })
    })
}

async function removeDupFolder(data) {
    //查找非叶子结点的去重
    const nodeList = []
    const folderMap = {}//path到id的映射
    function handle(node, path) {
        node.nodePath = path;
        nodeList.push(node)
        if (node.url) {
            return
        }
        //是个文件夹
        const k = path.join('$')
        if (!folderMap[k]) {
            folderMap[k] = node;
        }
        for (let i of node.children) {
            handle(i, push(path, i.title));
        }
    }

    for (let i of data) {
        handle(i, []);
    }
    for (let i of nodeList) {
        if (!i.parentId) {
            continue;
        }
        const path = i.nodePath.slice(0, i.nodePath.length - 1)
        const k = path.join('$')
        const parent = folderMap[k]
        if (parent.id !== i.parentId) {
            await move(i.id, {parentId: parent.id})
            console.log(`moving ${i.nodePath} to ${k} ${i.parentId}`)
        }
    }
}

async function removeDupLeaf(data) {
    function findDupLeaf(node) {
        const urlMap = {}

        function handleNode(node, path) {
            node.nodePath = path;
            if (node.url) {
                if (!urlMap[node.url]) {
                    urlMap[node.url] = []
                }
                urlMap[node.url].push(node)
            }
            for (let i of node.children || []) {
                handleNode(i, push(path, node.title))
            }
        }

        for (let i of node) {
            handleNode(i, [])
        }
        const dupUrlMap = {}
        for (let [k, v] of Object.entries(urlMap)) {
            if (v.length > 1) {
                dupUrlMap[k] = v;
            }
        }
        return dupUrlMap;
    }

    const dup = findDupLeaf(data);
    let dupCount = 0;
    for (let [k, v] of Object.entries(dup)) {
        let keep = v[0];
        for (let i of v) {
            if (keep.nodePath.length < i.nodePath.length) {
                keep = i;
            }
        }
        for (let i of v) {
            if (i.id !== keep.id) {
                dupCount += 1;
                await remove(i.id)
            }
        }
    }
    return dupCount;
}

function removeEmptyFolder(data) {
    //删除空文件夹，如果存在多层空文件夹也会删除
    let emptyCount = 0;

    function getLeafCount(node) {
        if (node.url) {
            return 1;
        }
        let leafCount = 0;
        for (let i of node.children) {
            leafCount += getLeafCount(i);
        }
        if (leafCount === 0) {
            //没有儿子，则删除当前这个空文件夹
            if (node.parentId === "0") {
                //对于根目录下的空文件夹，不执行删除过程
            } else {
                emptyCount += 1;
                console.log(`removing ${node.title}`)
                write(`<div class="deleteEmpty">删除空文件夹 "${node.title}"</div>`)
                removeTree(node.id)
            }
        }
        return leafCount;
    }

    for (let i of data) {
        getLeafCount(i)
    }
    return emptyCount;
}

async function main() {
    let data = await getTree()
    const dupLeafCount = await removeDupLeaf(data);
    data = await getTree();//重新获得树
    await removeDupFolder(data);
    data = await getTree();
    const emptyFolderCount = await removeEmptyFolder(data);
    console.log(`everything is done`)
    write(`
<div>重复链接个数${dupLeafCount}</div>
<div>空文件夹个数${emptyFolderCount}</div>
   `)
}

document.onreadystatechange = function () {
    if (document.readyState === "complete") {
        document.querySelector('#go').addEventListener('click', e => {
            main().then(() => {
                console.log('done')
            })
        })
    }
}