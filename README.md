# download-file 
不使用第三方库的nodejs下载文件工具

## 环境要求
```
>=Node.js v10.12.0

使用了v10.12.0以上的版本 fs.mkdirSync(dirPath, { recursive: true });  
```


## 引入使用
```
使用实例
    const downloadFile = require('./download-file.js');

    downloadFile({
        href: "http://***.***.***.***/deno.zip",
    }).then(() => {
        console.log("下载完成");
    })
    .catch((error) => {
        console.log(下载失败);
    });

参数说明
    href: 下载文件的URL。
    headers: HTTP请求头。如:{Cookie: 'xxx', 'User-Agent': 'xxx'}
    isChunk: 是否使用分片下载。默认:true, 可选[true,false]
    chunkSize: 分片的大小。默认:1024 * 1024 * 1(字节)
    timeout: 请求超时时间。默认:15000(毫秒)
    poolCount: 并发下载线程数。默认:5
    retry: 每个分片的重试次数。默认:10
    fileName: 下载文件的名称。默认:下载文件的URL的文件名。
    fileDir: 下载文件保存的目录。默认:当前目录
    cacheDir: 缓存文件保存的目录。默认:当前目录/URL的文件名。
    cacheExt: 缓存文件的后缀。默认:ca
    cacheDbName: 缓存数据库的名称。默认:00.json
    isCache: 是否使用缓存。默认:true, 可选[true,false]
    isWriteLog: 是否记录日志。默认:true, 可选[true,false]
    logDir: 日志文件保存的目录。默认:当前目录/log
    logFileName: 日志文件的名称。默认:log.txt
    isConsole: 是否在控制台输出日志。默认:true, 可选[true,false]
    onProgress: 下载进度回调函数。返回:[{index: 序号,start:分片开始索引,end:分片结束索引,status: 状态(init:初始化,starting:开始下载,finish:下载完成)}]

```

## 命令行参数
```
使用实例
    node ./download-file.js --href=http://***.***.***.***/deno.zip

参数说明
    -- href: 下载文件的URL。
    -- headers: HTTP请求头。 如：--headers='Cookie:aaa,User-Agent:bbb'
    -- isChunk: 是否使用分片下载。默认:true, 可选[true,false]
    -- chunkSize: 分片的大小。默认:1024 * 1024 * 1(字节)
    -- timeout: 请求超时时间。默认:15000(毫秒)
    -- poolCount: 并发下载线程数。默认:5
    -- retry: 每个分片的重试次数。默认:10
    -- fileName: 下载文件的名称。默认:下载文件的URL的文件名。
    -- fileDir: 下载文件保存的目录。默认:当前目录
    -- cacheDir: 缓存文件保存的目录。默认:当前目录/URL的文件名。
    -- cacheExt: 缓存文件的后缀。默认:ca
    -- cacheDbName: 缓存数据库的名称。默认:00.json
    -- isCache: 是否使用缓存。默认:true, 可选[true,false]
    -- isWriteLog: 是否记录日志。默认:true, 可选[true,false]
    -- logDir: 日志文件保存的目录。默认:当前目录/log
    -- logFileName: 日志文件的名称。默认:log.txt
    -- isConsole: 是否在控制台输出日志。默认:true, 可选[true,false]
```
## 功能介绍
```
[√] 自定义headers
[√] 分片下载
[√] 超时时间
[√] 线程数
[√] 下载路径
[√] 下载文件名
[√] 缓存目录
[√] 缓存后缀名
[√] 缓存数据文件名
[√] 是否使用缓存
[√] 是否记录日志
[√] 日志文件保存的目录
[√] 日志文件的名称
[√] 是否在控制台输出日志
[√] 错误处理回调函数
[√] 下载成功回调函数
[√] 下载进度回调函数
```
