/**
 * CoordinatorHub 使用示例
 *
 * 运行方式: npx tsx examples/demo.ts
 */

import {
  TaskManager,
  PermissionAskHandler,
  formatConfirmationMessage,
} from '../src/index.js'

async function main() {
  console.log('=== CoordinatorHub Demo ===\n')

  // 1. 创建任务管理器
  console.log('1. 创建任务管理器...')
  const taskManager = new TaskManager({
    defaultTimeout: 300000,
    maxConcurrentTasks: 5,
  })
  console.log('   任务管理器已创建\n')

  // 2. 订阅任务事件
  console.log('2. 订阅任务事件...')
  taskManager.subscribe((event) => {
    const time = new Date().toLocaleTimeString()
    switch (event.type) {
      case 'created':
        console.log(`   [${time}] 📝 任务创建: ${event.task.id}`)
        break
      case 'started':
        console.log(`   [${time}] ▶️  任务开始: ${event.taskId}`)
        break
      case 'completed':
        console.log(`   [${time}] ✅ 任务完成: ${event.taskId}`)
        break
      case 'failed':
        console.log(`   [${time}] ❌ 任务失败: ${event.taskId} - ${event.error}`)
        break
      case 'progress':
        console.log(`   [${time}] 📊 进度: ${event.taskId} - ${event.progress}% ${event.message || ''}`)
        break
      case 'timeout':
        console.log(`   [${time}] ⏰ 任务超时: ${event.taskId}`)
        break
    }
  })
  console.log()

  // 3. 创建任务
  console.log('3. 创建任务...')
  const researchTask = await taskManager.createTask({
    description: '研究股票行情',
    prompt: '请分析今日 A 股市场走势，重点关注科技板块',
    type: 'research',
  })
  console.log(`   创建任务: ${researchTask.id}`)
  console.log(`   类型: ${researchTask.type}`)
  console.log(`n`)

  // 4. 开始任务
  console.log('4. 开始任务...')
  await taskManager.startTask(researchTask.id)
  console.log()

  // 5. 模拟任务执行
  console.log('5. 模拟任务执行...')
  await taskManager.updateProgress(researchTask.id, 30, '正在收集数据...')
  await new Promise((r) => setTimeout(r, 500))
  await taskManager.updateProgress(researchTask.id, 60, '正在分析...')
  await new Promise((r) => setTimeout(r, 500))
  await taskManager.updateProgress(researchTask.id, 90, '正在生成报告...')
  await new Promise((r) => setTimeout(r, 500))
  console.log()

  // 6. 完成任务
  console.log('6. 完成任务...')
  await taskManager.completeTask(researchTask.id, {
    summary: '今日 A 股三大指数涨跌互现，创业板指跌近 2%。科技板块领跌，半导体、AI 概念股普遍回调。',
    details: {
      shanghai: { index: 3891, change: -0.8 },
      shenzhen: { index: 13478, change: -1.81 },
      chinext: { index: 3184, change: -2.7 },
    },
  })
  console.log()

  // 7. 任务分解示例
  console.log('7. 任务分解...')
  const parentTask = await taskManager.createTask({
    description: '全面分析上市公司',
    prompt: '对目标公司进行全面分析',
    type: 'general',
  })

  const subtasks = await taskManager.createSubtasks(parentTask.id, [
    {
      description: '财务分析',
      prompt: '分析公司财务报表',
      type: 'research',
    },
    {
      description: '行业分析',
      prompt: '分析行业竞争格局',
      type: 'research',
    },
    {
      description: '生成报告',
      prompt: '整合分析结果生成报告',
      type: 'implement',
    },
  ])

  console.log(`   父任务: ${parentTask.id}`)
  console.log(`   子任务数: ${subtasks.length}`)
  for (const subtask of subtasks) {
    console.log(`     - ${subtask.id}: ${subtask.description}`)
  }
  console.log()

  // 8. 权限确认处理器
  console.log('8. 权限确认处理器...')
  const askHandler = new PermissionAskHandler({
    defaultTimeout: 5000, // 演示用 5 秒
    onAsk: async (request) => {
      const message = formatConfirmationMessage(
        request.request,
        request.reason
      )
      console.log('   [模拟确认对话框]')
      console.log('   ' + message.replace(/\n/g, '\n   '))
      // 模拟用户自动确认
      return true
    },
    onTimeout: (request) => {
      console.log(`   ⚠️ 请求 ${request.id} 超时`)
    },
  })

  // 模拟权限请求
  console.log('   模拟权限请求...')
  const confirmed = await askHandler.requestConfirmation(
    {
      subject: { agentId: 'chengcai' },
      object: { toolId: 'wechat/send' },
    },
    '发送微信消息需要确认'
  )
  console.log(`   确认结果: ${confirmed ? '✅ 允许' : '❌ 拒绝'}`)
  console.log()

  // 9. 列出所有任务
  console.log('9. 当前任务状态:')
  const allTasks = await taskManager.listTasks()
  for (const task of allTasks.slice(0, 5)) {
    const statusName =
      task.status.state === 'completed'
        ? '✅'
        : task.status.state === 'running'
        ? '▶️'
        : task.status.state === 'failed'
        ? '❌'
        : '⏳'
    console.log(`   ${statusName} ${task.id.slice(0, 20)}... - ${task.status.state}`)
  }
  console.log()

  console.log('=== Demo 完成 ===')
}

main().catch(console.error)
