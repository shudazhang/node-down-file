const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// 导出函数，使其可供其他模块调用
module.exports = function (options) {
  return new Promise((resolve, reject) => {
    startDownFunc({
      ...options,
      onError: (err) => {
        reject(err);
      },
      onSuccess: () => {
        resolve();
      },
    });
  });
};

// 当脚本作为主模块执行时，以下代码块将被激活
if (!module.parent) {
  // 获取命令行中所有以 '--' 开头的参数
  let argvList = process.argv.filter((item) => item.startsWith("--"));

  // 如果存在自定义参数
  if (argvList.length > 0) {
    // 初始化一个对象用于存储解析后的参数键值对
    let result = {};

    // 遍历所有自定义参数
    argvList.forEach((item) => {
      // 解析参数名，移除 '--' 后分割字符串取第一部分作为键名
      let key = item.replace("--", "").split("=")[0];
      // 解析参数值，移除 '--' 后按等号分割字符串取第二部分作为键值
      let value = item.replace("--", "").split("=")[1];
      if (value === "true" || value === "false") {
        value = value === "true" ? true : false;
      }
      if (key === "headers") {
        // value = JSON.parse(value);
        value = value.split(",").reduce((acc, cur) => {
          let [key, value] = cur.split(":");
          acc[key] = value;
          return acc;
        }, {});
      }
      // 将解析出的键值对存入结果对象
      result[key] = value;
    });
    // 使用解析后的参数对象调用下载启动函数
    startDownFunc(result);
  }
}

/**
 * 启动下载功能的主函数。
 * 使用异步函数语法，以处理可能的异步操作，如文件下载和目录创建。
 * @param {Object} opts - 下载任务的配置选项，默认为空对象。
 * opts 包含以下属性：
 *   - href: 下载文件的URL。
 *   - headers: HTTP请求头。
 *   - isChunk: 是否使用分片下载。
 *   - chunkSize: 分片的大小。
 *   - timeout: 请求超时时间。
 *   - poolCount: 并发下载线程数。
 *   - retry: 每个分片的重试次数。
 *   - fileName: 下载文件的名称。
 *   - fileDir: 下载文件保存的目录。
 *   - cacheDir: 缓存文件保存的目录。
 *   - cacheExt: 缓存文件的后缀。
 *   - cacheDbName: 缓存数据库的名称。
 *   - isCache: 是否使用缓存。
 *   - isWriteLog: 是否记录日志。
 *   - logDir: 日志文件保存的目录。
 *   - logFileName: 日志文件的名称。
 *   - isConsole: 是否在控制台输出日志。
 *   - onError: 错误处理回调函数。
 *   - onSuccess: 下载成功回调函数。
 *   - onProgress: 下载进度回调函数。
 *   - downSize: 已下载的文件大小。
 *   - fileSize: 文件的总大小。
 *   - taskList: 下载任务列表。
 */
async function startDownFunc(opts = {}) {
  try {
    // 初始化下载选项
    var options = {
      href: "", // 下载文件地址
      headers: {}, // 请求头
      isChunk: true, // 是否分片下载
      chunkSize: 1024 * 1024 * 1, // 分片大小
      timeout: 15000, // 超时时间
      poolCount: 5, //并发下载数
      retry: 10, // 每分片的重试最大次数
      fileName: opts.fileName || path.parse(opts.href).base, // 下载文件名
      fileDir: opts.fileDir || './', // 下载文件目录
      cacheDir: path.join(
        // 缓存文件目录
        opts.fileDir || './',
        opts.fileName || path.parse(opts.href).name
      ),
      cacheExt: "ca", // 缓存文件后缀
      cacheDbName: "00.json", // 缓存数据文件名
      isCache: true, // 是否开启缓存
      isWriteLog: true, // 是否开启日志
      logDir: "log", // 日志目录
      logFileName: "log.txt", // 日志文件
      isConsole: true, // 是否开启控制台日志
      onError: onErrorFunc, // 错误回调
      onSuccess: onSuccessFunc, // 成功回调
      onProgress: onProgressFunc, // 进度回调
      downSize: 0, // 已下载大小 字节
      fileSize: 0, // 总大小 字节
      taskList: [], //  任务列表
      ...opts,
    };

    // 合并缓存相关的配置选项
    options = {
      ...options,
      ...getCacheDataFunc(options.isCache, options.cacheDir, options.cacheDbName),
    };

    // 记录开始下载的日志
    writeLogFunc(`开始下载:${options.href}`, options.isWriteLog, options.logDir, options.logFileName, options.isConsole);

    // 获取文件大小
    options.fileSize = await getFileSizeFunc(options.href, options.headers, options.timeout);

    // 记录文件大小的日志
    writeLogFunc(`获取的文件大小:${options.fileSize}`, options.isWriteLog, options.logDir, options.logFileName, options.isConsole);

    // 创建文件保存目录
    await createFolderFunc(options.fileDir);

    // 创建缓存文件保存目录
    await createFolderFunc(options.cacheDir);

    // 根据配置确定任务列表的获取方式
    // 获取任务列表
    options.taskList = getTaskListCacheFunc(options.taskList) || getTaskListNotChunkFunc(options.isChunk, options.fileSize, options.cacheDir, options.cacheExt) || getTaskListChunkFunc(options.fileSize, options.chunkSize, options.cacheDir, options.cacheExt);

    // 记录分片数量的日志
    writeLogFunc(`分片数量:${options.taskList.length}`, options.isWriteLog, options.logDir, options.logFileName, options.isConsole);

    // 计算已下载的分片大小
    options.downSize = await getDownSizeFunc(options.taskList);

    // 初始化下载线程池
    var poolList = [];
    for (let poolIndex = 0; poolIndex < options.poolCount; poolIndex++) {
      loopGetActiveTaskFunc(options, poolList, poolIndex);
    }
  } catch (error) {
    // 错误处理，调用错误回调函数并记录错误日志
    options.onError(error);
    writeLogFunc(error.message, options.isWriteLog, options.logDir, options.logFileName, options.isConsole);
  }
}
/**
 * 下载器函数，用于从给定的URL下载资源。
 *
 * @param {string} href - 资源的URL。
 * @param {Object} headers - 请求头部信息。
 * @param {Object} activeTask - 当前活跃的任务对象，包含任务的起始和结束位置。
 * @param {Object} poolItem - 任务池中的项，用于管理请求和超时。
 * @param {Array} taskList - 任务列表，用于更新下载进度。
 * @param {Function} onProgress - 进度更新回调函数。
 * @param {number} timeout - 请求超时时间。
 * @returns {Promise} 返回一个Promise对象，表示下载操作的完成或失败。
 */
function downloaderFunc(href, headers, activeTask, poolItem, taskList, onProgress, timeout) {
  return new Promise((resolve, reject) => {
    // 解析URL以获取请求所需的详细信息
    // 解析URL，以获取请求所需的主机名、端口等信息。
    var hrefObj = new URL(href);

    // 根据URL的协议选择http或https模块
    // 根据URL的协议选择http或https模块。
    const protocol = hrefObj.protocol === "https:" ? https : http;

    // 设置超时处理，超时则拒绝Promise
    poolItem.timer = setTimeout(() => {
      poolItem.req && poolItem.req.destroy && poolItem.req.destroy();
      reject(new Error("下载超时"));
    }, timeout);

    // 发起HTTP请求
    poolItem.req = protocol.request(
      {
        hostname: hrefObj.hostname,
        port: hrefObj.port,
        path: hrefObj.pathname,
        method: "GET",
        headers: {
          ...headers,
          Range: `bytes=${activeTask.start}-${activeTask.end}`, // 请求特定范围的资源
        },
        search: hrefObj.search,
      },
      (res) => {
        // 清除超时计时器
        clearTimeout(poolItem.timer);
        poolItem.timer = null;
        activeTask.retry = 0; // 重试次数重置为0
        // 创建写入流，将下载的资源写入文件
        const fileStream = fs.createWriteStream(activeTask.path, { flags: "a" });
        res.pipe(fileStream);
        // 监听数据事件，更新下载进度
        res.on("data", (chunk) => {
          activeTask.downSize += chunk.length; // 更新已接收的字节数
          onProgress(taskList); // 触发进度更新回调
        });
        // 监听结束事件，表示下载完成
        res.on("end", () => {
          clearTimeout(poolItem.timer);
          poolItem.timer = null;
          resolve(); // 解决Promise表示下载成功
        });
      }
    );
    // 监听请求错误事件，拒绝Promise表示下载失败
    poolItem.req.on("error", async (error) => {
      clearTimeout(poolItem.timer);
      poolItem.timer = null;
      reject(error);
    });
    // 结束请求
    poolItem.req.end();
  });
}

/**
 * 异步函数：循环获取激活的任务函数
 * 该函数主要用于处理任务的循环执行，包括检查所有任务是否完成、合并文件、处理重试次数超过上限的情况、激活任务的下载等。
 * @param {Object} options - 任务配置选项，包括任务列表、文件目录、文件名、缓存目录、回调函数等。
 * @param {Array} poolList - 连接池列表，用于管理请求对象和定时器。
 * @param {number} poolIndex - 当前连接池的索引。
 */
async function loopGetActiveTaskFunc(options, poolList, poolIndex) {
  try {
    // 检查所有任务是否已完成
    /** 1:验证是否全部完成 2:合并文件、3: 删除临时文件夹 **/
    // 1: 验证是否全部完成
    let isAllFinish = options.taskList.every((item) => item.status === "finish");
    if (isAllFinish) {
      // 合并文件
      //2:合并文件
      fs.writeFileSync(path.join(options.fileDir, options.fileName), Buffer.alloc(0)); // 先清空目标文件
      for (let taskIndex = 0; taskIndex < options.taskList.length; taskIndex++) {
        fs.appendFileSync(path.join(options.fileDir, options.fileName), fs.readFileSync(options.taskList[taskIndex].path)); // 将内容追加到目标文件
      }
      // 删除临时文件夹
      // 3: 删除临时文件夹
      deleteFolderFunc(options.cacheDir);
      // 调用成功回调函数
      options.onSuccess();
      // 写入日志
      writeLogFunc("下载完成", options.isWriteLog, options.logDir, options.logFileName, options.isConsole);
      return;
    }

    // 遍历任务列表，检查是否有任务重试次数达到最大值
    /** 验证连接次数 **/
    for (let taskIndex = 0; taskIndex < options.taskList.length; taskIndex++) {
      if (options.taskList[taskIndex].retry >= options.retry) {
        // 关闭所有请求，清除定时器，并触发错误回调
        poolList.forEach((item) => {
          if (item.req && item.req.destroy) {
            item.req.destroy();
          }
          if (item.timer) {
            clearTimeout(item.timer);
            item.timer = null;
          }
          item.req = null;
        });
        options.onError({ message: "重连次数达到最大值" });
        writeLogFunc("重连次数达到最大值", options.isWriteLog, options.logDir, options.logFileName, options.isConsole);
        return;
      }
    }

    // 查找状态为"init"的激活任务
    let activeTask = options.taskList.find((item) => item.status === "init");

    if (!activeTask) {
      return;
    }
    // 更新任务状态和重置相关字段
    activeTask.status = "starting";
    activeTask.downSize = 0;
    // 清除当前连接池的定时器和请求
    poolList[poolIndex] && poolList[poolIndex].timer && clearTimeout(poolList[poolIndex].timer);
    poolList[poolIndex] && poolList[poolIndex].req && poolList[poolIndex].req.destroy();
    // 初始化当前连接池
    poolList[poolIndex] = {
      req: "",
      activeTask,
      timer: null,
    };
    // 清空任务文件内容
    fs.writeFileSync(activeTask.path, Buffer.alloc(0)); // 先清空目标文件
    // 更新缓存数据库
    fs.writeFileSync(path.join(options.cacheDir, options.cacheDbName), JSON.stringify(options));
    try {
      // 执行下载函数
      await downloaderFunc(options.href, options.headers, activeTask, poolList[poolIndex], options.taskList, options.onProgress, options.timeout);
      // 检查任务是否完成
      if (fs.statSync(activeTask.path).size - 1 === activeTask.end - activeTask.start) {
        activeTask.status = "finish";
      } else {
        // 任务未完成，增加重试次数并重新初始化任务
        activeTask.retry++;
        activeTask.status = "init";
        activeTask.downSize = 0;
      }
    } catch (error) {
      // 下载出错，增加重试次数并重新初始化任务
      activeTask.retry++;
      activeTask.status = "init";
      activeTask.downSize = 0;
    }
    // 递归调用自身，继续处理下一个激活任务
    loopGetActiveTaskFunc(options, poolList, poolIndex);
  } catch (error) {
    // 错误处理：打印错误、调用错误回调、写入日志
    options.onError(error);
    writeLogFunc(error.message, options.isWriteLog, options.logDir, options.logFileName, options.isConsole);
  }
}

/**
 * 计算已完成任务文件大小的函数，返回所有完成任务文件的总大小。
 *
 * @param {Array<{status: string, path: string}>} taskList - 任务列表，每个对象包含状态（"finish"表示完成）和文件路径。
 * @returns {Promise<number>} - 返回一个Promise，解析为所有完成任务文件的总大小（以字节为单位）。
 *
 * @throws {Error} - 如果在读取或检查文件大小时发生错误，Promise将被拒绝，并携带错误信息。
 *
 * 此函数通过遍历任务列表，检查每个任务的状态。只有当任务状态为"finish"时，
 * 才会使用fs模块同步获取文件大小并累加到总和中。最后，将计算出的总大小解析给Promise的解决回调。
 */
function getDownSizeFunc(taskList) {
  return new Promise((resolve, reject) => {
    try {
      const result = taskList.reduce((total, item) => {
        let size = 0;
        if (item.status === "finish") {
          size = fs.statSync(item.path).size;
        }
        return total + size;
      }, 0);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 获取任务列表缓存状态的函数
 * @param {Array<{path: string, start: number, end: number}>} taskList - 任务列表，包含文件路径、起始位置和结束位置
 * @returns {Array<{path: string, start: number, end: number, status: 'finish' | 'init', downSize: number, retry: number}>} - 更新后的任务列表，包含状态、已下载大小和重试次数
 *
 * 此函数检查传入的任务列表中的每个任务，如果任务对应的文件存在且文件大小与任务的长度一致，
 * 则将其状态设为"finish"并记录已下载大小；否则，将状态设为"init"，重置重试次数为0，并将已下载大小设为0。
 */
function getTaskListCacheFunc(taskList) {
  if (Array.isArray(taskList) && taskList.length > 0) {
    return taskList.map((item) => {
      // 检查文件是否存在以及文件大小是否与任务长度匹配
      if (fs.existsSync(item.path) && fs.statSync(item.path).size - 1 == item.end - item.start) {
        item.status = "finish"; // 设置状态为完成
        item.downSize = item.end - item.start; // 记录已下载大小
      } else {
        item.status = "init"; // 设置状态为初始化
        item.retry = 0; // 重置重试次数
        item.downSize = 0; // 清零已下载大小
      }
      return item;
    });
  }
}

/**
 * 根据是否采用分块下载的策略，生成不同的下载任务列表。
 *
 * 当不采用分块下载（isChunk为false）时，生成一个包含整个文件的下载任务。
 *
 * @param {boolean} isChunk 是否采用分块下载策略。
 * @param {number} fileSize 文件的总大小。
 * @param {string} cacheDir 缓存文件的目录。
 * @param {string} cacheExt 缓存文件的扩展名。
 * @returns {Array} 返回一个下载任务列表，每个任务包含下载的起始位置、结束位置、状态等信息。
 */
function getTaskListNotChunkFunc(isChunk, fileSize, cacheDir, cacheExt) {
  // 如果不采用分块下载，则返回包含整个文件下载任务的数组
  if (!isChunk) {
    return [
      {
        index: 0, // 任务索引
        start: 0, // 下载起始位置
        end: fileSize - 1, // 下载结束位置
        status: "init", // 任务状态
        retry: 0, // 重试次数
        downSize: 0, // 已下载大小
        path: path.join(cacheDir, `0.${cacheExt}`), // 缓存文件路径
      },
    ];
  }
}

/**
 * 根据文件大小、块大小、缓存目录和缓存文件扩展名，生成下载任务的分块信息。
 *
 * @param {number} fileSize - 文件的总大小，单位为字节。
 * @param {number} chunkSize - 每个分块的大小，单位为字节。
 * @param {string} cacheDir - 缓存文件的目录路径。
 * @param {string} cacheExt - 缓存文件的扩展名。
 * @returns {Array} 返回一个对象数组，每个对象代表一个分块的任务信息。
 */
function getTaskListChunkFunc(fileSize, chunkSize, cacheDir, cacheExt) {
  // 初始化结果数组，用于存储所有分块的任务信息。
  let result = [];
  // 初始化起始位置和结束位置，用于定义每个分块的范围。
  let start = 0;
  let end = chunkSize - 1;
  // 初始化索引，用于唯一标识每个分块。
  let index = 0;
  // 当当前分块的结束位置小于文件总大小时，循环继续。
  while (end < fileSize - 1) {
    // 将当前分块的信息添加到结果数组中。
    result.push({
      index,
      start,
      end,
      status: "init",
      retry: 0,
      downSize: 0,
      path: path.resolve(cacheDir, `${index}.${cacheExt}`),
    });
    // 更新起始位置和结束位置，为下一个分块做准备。
    start += chunkSize;
    end += chunkSize;
    // 索引自增，用于标识下一个分块。
    index++;
  }
  // 处理最后一个分块，其结束位置为文件的总大小减一。
  result.push({
    index,
    start,
    end: fileSize - 1,
    status: "init",
    retry: 0,
    downSize: 0,
    path: path.resolve(cacheDir, `${index}.${cacheExt}`),
  });
  // 返回包含所有分块任务信息的数组。
  return result;
}

/**
 * 处理错误的函数
 *
 * 当发生错误时，此函数被调用。它提供了一个地方来处理错误，例如记录错误、显示错误消息或进行一些恢复操作。
 * 不同的应用可能会有不同的错误处理策略，这个函数提供了灵活性来实现这些策略。
 *
 * @param {Error} error 错误对象，包含有关错误的详细信息。可以使用error对象来获取错误的堆栈跟踪、错误消息等。
 *
 * 注意：这个函数体是空的，但在实际应用中，可能会包含对错误的处理逻辑。
 */
function onErrorFunc(error) {}

/**
 * 成功处理函数
 *
 * 该函数定义了成功处理时的回调操作。在实际应用中，它应该被用于处理成功状态下的逻辑，例如数据的展示、用户界面的更新等。
 * 由于当前函数体为空，它没有执行任何具体操作。在实际使用中，应根据具体需求填充函数体。
 *
 * @returns {void} 该函数没有返回值。
 */
function onSuccessFunc() {}

/**
 * 进度条更新函数
 *
 * 本函数用于根据任务列表的完成情况更新进度条。它通过计算所有任务的已完成下载大小和总大小，
 * 来确定进度条应该显示的进度。
 *
 * @param {Array} taskList - 任务列表，每个任务对象包含下载的开始和结束位置以及已下载的大小。
 */
function onProgressFunc(taskList) {
  // 获取所有任务的结束位置，用于确定总任务大小
  let allSize = taskList[taskList.length - 1].end;

  // 累加计算所有任务已完成的下载大小
  let allDownSize = taskList.reduce((total, item) => total + item.downSize, 0);

  // 调用进度条显示函数，传入已完成大小和总大小
  processBarFunc(allDownSize, allSize);
}

/**
 * 写入日志的函数。
 * 根据参数决定是否在控制台输出日志内容，并根据配置将日志写入文件。
 *
 * @param {string} logContent - 需要记录的日志内容。
 * @param {boolean} isWriteLog - 是否将日志写入文件。
 * @param {string} logDir - 日志文件的存储目录。
 * @param {string} logFileName - 日志文件的名称。
 * @param {boolean} isConsole - 是否在控制台输出日志。
 */
function writeLogFunc(logContent, isWriteLog, logDir, logFileName, isConsole) {
  // 如果配置为在控制台输出日志，则打印日志内容
  if (isConsole) {
    console.log(logContent);
  }
  // 如果配置为写入日志文件，则调用日志写入函数
  if (isWriteLog) {
    logFunc(logContent, logFileName, logDir);
  }
}

/**
 * 获取缓存数据
 * @param {boolean} isCache  是否开启缓存
 * @param {string} cacheDir  缓存目录
 * @param {string} cacheDbName 缓存数据文件名称
 * @returns
 */
function getCacheDataFunc(isCache, cacheDir, cacheDbName) {
  var cacheData = {};
  try {
    let cacheDbPath = path.resolve(cacheDir, cacheDbName);
    if (isCache && fs.existsSync(cacheDbPath)) {
      cacheData = JSON.parse(fs.readFileSync(cacheDbPath, "utf8"));
    }
  } catch (error) {
    fs.unlinkSync(cacheDbPath);
  }
  return cacheData;
}

/**
 * 异步删除给定路径的文件夹。
 * 如果文件夹不存在，则不执行任何操作。
 * 此函数递归处理文件夹内的子文件夹和文件，确保整个文件夹结构被删除。
 *
 * @param {string} folderPath - 要删除的文件夹的路径。
 * @throws 如果删除过程中遇到任何问题，将抛出错误。
 */
async function deleteFolderFunc(folderPath) {
  try {
    // 检查文件夹是否存在，如果不存在则直接返回
    if (!fs.existsSync(folderPath)) {
      return;
    }

    // 读取文件夹内的所有文件和子文件夹
    const files = await fs.promises.readdir(folderPath);
    // 对文件夹内的每个项进行处理，如果是文件则删除，如果是文件夹则递归调用本函数
    await Promise.all(
      files.map(async (file) => {
        const curPath = path.join(folderPath, file);
        try {
          // 获取当前项的统计信息，以判断是文件还是文件夹
          const stats = await fs.promises.lstat(curPath);
          // 如果是文件夹，则递归调用本函数
          if (stats.isDirectory()) {
            await deleteFolderFunc(curPath);
          } else {
            // 如果是文件，则直接删除
            await fs.promises.unlink(curPath);
          }
        } catch (error) {
          // 如果在处理过程中发生错误，则抛出
          throw error;
        }
      })
    );

    // 在所有文件和子文件夹处理完毕后，尝试删除空文件夹
    try {
      await fs.promises.rmdir(folderPath);
    } catch (error) {
      // 如果删除文件夹失败，则抛出错误
      throw error;
    }
  } catch (error) {
    // 如果在删除过程中发生任何错误，则抛出新错误，包含错误消息
    throw new Error(`删除文件夹失败:${error.message}`);
  }
}

/**
 * 创建一个目录的函数，如果目录已存在，则不进行任何操作。
 *
 * @param {string} dirPath - 需要创建的目录的路径。
 * @returns {Promise} 返回一个Promise对象，表示目录创建操作的结果。
 */
function createFolderFunc(dirPath) {
  return new Promise((resolve, reject) => {
    try {
      // 将传入的路径解析为绝对路径
      const dir = path.resolve(dirPath);
      // 检查目录是否存在，如果不存在则创建目录
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // 目录创建成功，调用resolve
      resolve();
    } catch (error) {
      // 目录创建失败，调用reject并传递错误信息
      reject(new Error(`创建目录失败：${error.message}`));
    }
  });
}

/**
 * 异步获取指定URL的文件大小。
 *
 * 该函数通过发送一个HTTP HEAD请求来获取目标URL的文件大小，
 * 它使用了Promise来处理异步操作的结果， either resolving with the file size or rejecting with an error.
 *
 * @param {string} href - 目标URL。
 * @param {Object} headers - 请求头信息，默认为空对象。
 * @returns {Promise} - 返回一个Promise对象，解析为文件大小（数字），或拒绝为错误对象。
 */
async function getFileSizeFunc(href, headers = {}, timeout) {
  return new Promise((resolve, reject) => {
    try {
      // 解析URL，以获取请求所需的主机名、端口等信息。
      var hrefObj = new URL(href);
    } catch (error) {
      // 如果URL解析失败，则拒绝Promise并返回错误信息。
      return reject(new Error(`无效的URL地址`));
    }
    // 根据URL的协议选择http或https模块。
    const protocol = hrefObj.protocol === "https:" ? https : http;
    // 创建请求对象。
    const request = protocol.request(
      {
        hostname: hrefObj.hostname,
        port: hrefObj.port,
        path: hrefObj.pathname,
        method: "HEAD",
        headers: headers,
        search: hrefObj.search,
      },
      (response) => {
        // 如果响应状态码为200，表示请求成功。
        if (response.statusCode === 200) {
          // 从响应头中获取内容长度。
          const contentLength = response.headers["content-length"];
          if (contentLength) {
            try {
              // 将内容长度解析为数字，如果解析失败或结果为负数，则拒绝Promise并返回错误信息。
              // 安全地将内容长度转换为数值并返回
              const size = parseInt(contentLength, 10);
              if (isNaN(size) || size < 0) {
                reject(new Error(`无效的Content-Length值:${contentLength}`));
              } else {
                // 如果解析成功，则解析Promise并返回文件大小。
                resolve(size);
              }
            } catch (error) {
              // 如果在处理Content-Length时发生错误，则拒绝Promise并返回错误信息。
              reject(new Error(`转换Content-Length失败:${contentLength}`));
            }
          } else {
            // 如果响应头中没有Content-Length，则拒绝Promise并返回错误信息。
            reject(new Error(`Content-Length header 未找到`));
          }
        } else {
          // 如果响应状态码不为200，则拒绝Promise并返回错误信息。
          reject(new Error(`获取文件大小失败错误码: ${response.statusCode}`));
        }
        // 确保响应被完全读取，以避免内存泄漏。
        response.resume();
      }
    );

    // 处理请求过程中可能出现的错误。
    request.on("error", (error) => {
      reject(new Error(`请求过程中出现错误: ${error.message}`));
    });

    // 设置请求超时处理。
    const timeoutId = setTimeout(() => {
      if (!request.aborted) {
        request.abort();
        reject(new Error(`请求超时`));
      }
    }, timeout);

    // 请求结束时清除超时计时器
    request.on("close", () => clearTimeout(timeoutId));

    // 发送请求
    request.end();
  });
}

/**
 * 记录日志函数
 * 该函数用于向指定的目录中的日志文件写入日志信息。如果目录或日志文件不存在，则会创建它们。
 * @param {string} logContent - 要写入的日志内容，默认为空字符串。
 * @param {string} logFileName - 日志文件名，默认为"log.txt"。
 * @param {string} logDir - 日志文件所在的目录，默认为"log"。
 */
function logFunc(logContent = "", logFileName = "log.txt", logDir = "log") {
  // 检查日志目录是否存在，如果不存在则创建
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  // 检查日志文件是否存在，如果不存在则创建一个新文件并写入当前日期和"新建log文件"信息
  if (!fs.existsSync(path.join(logDir, logFileName))) {
    fs.writeFileSync(path.join(logDir, logFileName), `${currentDateFunc()}==新建log文件\n`);
  }
  // 向日志文件追加当前日期和日志内容
  fs.appendFileSync(path.join(logDir, logFileName), `${currentDateFunc()}==${logContent}\n`);
}

/**
 * 根据当前和总进度生成进度条字符串。
 * 进度条是一个可视化表示当前进度的方式，通过在控制台输出一个等于号（=）和短横线（-）组成的字符串来模拟进度条。
 *
 * @param {number} processBarCurrentSize 当前进度的大小，默认为0。
 * @param {number} processBarTotalSize 总进度的大小，默认为100。
 */
function processBarFunc(processBarCurrentSize = 0, processBarTotalSize = 100) {
  // 定义进度条的长度，默认为20个字符
  let processBarLength = 20;
  // 计算当前进度的百分比，结果向下取整
  let processBarCurrentPercent = ((processBarCurrentSize / processBarTotalSize) * 100).toFixed(2);
  // 根据当前进度的百分比计算进度条中已填充的部分的长度。
  // 如果当前进度小于总进度，进度条长度按比例计算；否则，进度条长度为最大值
  let processBarCurrentBarLength = processBarCurrentSize < processBarTotalSize ? Math.floor((processBarCurrentPercent / 100) * processBarLength) : processBarLength;
  // 构建进度条字符串，使用等于号（=）表示已填充的部分，短横线（-）表示未填充的部分。
  let processBarCurrentBar = `[${[...new Array(processBarCurrentBarLength).fill("="), ...new Array(processBarLength - processBarCurrentBarLength).fill("-")].join("")}]`;
  // 在控制台输出当前的进度条字符串，使用回车换行符（\r）来实现动态更新进度条。
  process.stdout.write(`\r ${processBarCurrentBar} ${processBarCurrentPercent}% `);
}

/**
 * 获取当前日期和时间的字符串表示。
 *
 * 该函数用于生成一个格式为`YYYY-MM-DD HH:MM:SS`的字符串，表示当前的日期和时间。
 * 使用`Date`对象和其方法来获取年、月、日、小时、分钟和秒的值，并通过字符串模板拼接这些值。
 * 为了确保日期和时间的每一位都是两位数，使用了`padStart`方法来在数字前补0。
 *
 * @returns {string} 当前日期和时间的字符串表示。
 */
function currentDateFunc() {
  // 创建一个新的Date对象，用于获取当前时间
  const now = new Date();
  // 获取当前年份
  const year = now.getFullYear();
  // 获取当前月份，由于`getMonth`方法返回的值从0开始，因此需要加1
  const month = String(now.getMonth() + 1).padStart(2, "0");
  // 获取当前日期
  const day = String(now.getDate()).padStart(2, "0");
  // 获取当前小时
  const hours = String(now.getHours()).padStart(2, "0");
  // 获取当前分钟
  const minutes = String(now.getMinutes()).padStart(2, "0");
  // 获取当前秒数
  const seconds = String(now.getSeconds()).padStart(2, "0");

  // 返回格式化后的日期和时间字符串
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
