import json
import os

current_task_definition = json.loads(os.environ['CURRENT_TASK_DEF'])
container_name = os.environ['CONTAINER_NAME']
image_uri = f"{os.environ['ECR_URI']}:{os.environ['IMAGE_TAG']}"

for container_definition in current_task_definition.get('containerDefinitions', []):
    if container_definition.get('name') == container_name:
        container_definition['image'] = image_uri

for key in (
    'taskDefinitionArn',
    'revision',
    'status',
    'requiresAttributes',
    'compatibilities',
    'registeredAt',
    'registeredBy',
):
    current_task_definition.pop(key, None)

print(json.dumps(current_task_definition))
